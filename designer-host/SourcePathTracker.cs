using System.Xml.Linq;

namespace DesignerHost;

/// <summary>
/// Owns the positional child-index path algorithm end to end, so the two call sites
/// (injecting into the render copy, looking up in the pristine copy) can never drift
/// apart. A path is a dot-separated sequence of Elements() indices from the document
/// root (e.g. "0.2.1"), computed identically on both documents - safe because neither
/// the clr-namespace text rewrite nor the x:Class/event-handler stripping RenderHost
/// applies to the render copy ever adds or removes elements, only attributes, so the
/// two documents stay structurally identical.
/// </summary>
internal static class SourcePathTracker
{
    private const string TrackPrefix = "__dh_track";
    private static readonly XNamespace TrackNamespace = "clr-namespace:DesignerHost;assembly=DesignerHost";
    private static readonly XNamespace XamlNamespace = "http://schemas.microsoft.com/winfx/2006/xaml";

    /// <summary>
    /// Non-DependencyObject markup-extension elements - an attached property can't be
    /// set on them, so (like property-element syntax) they're skipped for the Track.Path
    /// write, but their children still get indexed/descended into normally so numbering
    /// never drifts between the render copy and the pristine copy.
    /// </summary>
    private static readonly HashSet<string> SkippedMarkupExtensions = new(StringComparer.Ordinal)
    {
        "Static", "Array", "Type", "Null", "Reference"
    };

    public static void AssignPaths(XDocument document)
    {
        var root = document.Root;
        if (root is null) { return; }

        root.SetAttributeValue(XNamespace.Xmlns + TrackPrefix, TrackNamespace.NamespaceName);
        AssignPathsRecursive(root, "", insideResources: false);
    }

    private static void AssignPathsRecursive(XElement element, string path, bool insideResources)
    {
        // Resource-dictionary contents are never part of the rendered visual tree, so they
        // can never be hit-tested - and unlike ordinary visual elements, a resource entry
        // can be *any* CLR type (Style, ControlTemplate, a plain sys:Double/sys:String, a
        // Color/Point struct, ...), most of which aren't DependencyObjects. Confirmed by a
        // real failure: XamlReader.Parse threw "Object of type 'System.Double' cannot be
        // converted to type 'System.Windows.DependencyObject'" for a <sys:Double> resource
        // once Track.Path was injected onto it. Skipping the property-element itself (via
        // the localName.Contains('.') rule below) isn't enough - everything *inside* it
        // needs to be skipped too, not just enumerated known-bad type names, since resource
        // entries are open-ended.
        var stillInsideResources = insideResources || element.Name.LocalName.EndsWith(".Resources", StringComparison.Ordinal);

        if (!stillInsideResources && !IsSkipped(element))
        {
            element.SetAttributeValue(TrackNamespace + "Track.Path", path);
        }

        var index = 0;
        foreach (var child in element.Elements())
        {
            var childPath = path.Length == 0 ? index.ToString() : $"{path}.{index}";
            AssignPathsRecursive(child, childPath, stillInsideResources);
            index++;
        }
    }

    /// <summary>
    /// Same walk as AssignPathsRecursive, over the pristine (unmutated) document - the
    /// two documents are structurally identical (same Elements() shape at every level),
    /// so a path computed on one always resolves to the corresponding node on the other.
    /// </summary>
    public static XElement? Find(XDocument document, string path)
    {
        var current = document.Root;
        if (current is null) { return null; }
        if (path.Length == 0) { return current; }

        foreach (var segment in path.Split('.'))
        {
            if (!int.TryParse(segment, out var index)) { return null; }

            var children = current.Elements().ToList();
            if (index < 0 || index >= children.Count) { return null; }
            current = children[index];
        }
        return current;
    }

    private static bool IsSkipped(XElement element)
    {
        var localName = element.Name.LocalName;
        if (localName.Contains('.')) { return true; }
        return element.Name.Namespace == XamlNamespace && SkippedMarkupExtensions.Contains(localName);
    }
}
