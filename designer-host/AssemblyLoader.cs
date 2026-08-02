using System.IO;
using System.Reflection;
using System.Runtime.Loader;

namespace DesignerHost;

/// <summary>
/// Loads a target project's built assembly into the Default
/// AssemblyLoadContext so XamlReader's own (Default-context-based) type
/// resolution can see it - this is what makes `clr-namespace:` references to
/// the project's own converters/controls/behaviors resolve, mirroring how
/// Visual Studio's designer loads the project's build output. Dependencies
/// (NuGet packages the project references) are resolved on demand via each
/// assembly's own .deps.json-driven AssemblyDependencyResolver, registered
/// once against AssemblyLoadContext.Default.Resolving.
/// </summary>
internal static class AssemblyLoader
{
    private static readonly HashSet<string> LoadedPaths = new(StringComparer.OrdinalIgnoreCase);
    private static readonly List<AssemblyDependencyResolver> Resolvers = new();
    private static bool _resolvingHandlerRegistered;

    public static void EnsureLoaded(string assemblyPath)
    {
        if (LoadedPaths.Contains(assemblyPath))
        {
            return;
        }

        if (!File.Exists(assemblyPath))
        {
            throw new FileNotFoundException(
                $"Project assembly not found at '{assemblyPath}'. Build the project so the preview can load its compiled types.",
                assemblyPath);
        }

        EnsureResolvingHandlerRegistered();
        Resolvers.Add(new AssemblyDependencyResolver(assemblyPath));
        AssemblyLoadContext.Default.LoadFromAssemblyPath(assemblyPath);
        LoadedPaths.Add(assemblyPath);
    }

    private static void EnsureResolvingHandlerRegistered()
    {
        if (_resolvingHandlerRegistered)
        {
            return;
        }
        _resolvingHandlerRegistered = true;

        AssemblyLoadContext.Default.Resolving += (context, assemblyName) =>
        {
            foreach (var resolver in Resolvers)
            {
                var resolvedPath = resolver.ResolveAssemblyToPath(assemblyName);
                if (resolvedPath != null)
                {
                    return context.LoadFromAssemblyPath(resolvedPath);
                }
            }
            return null;
        };
    }
}
