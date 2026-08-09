using System.Windows;

namespace DesignerHost;

/// <summary>
/// Attached property injected onto elements during rendering (see
/// SourcePathTracker.AssignPaths) so a hit-tested live WPF object can be
/// correlated back to the exact XElement it was parsed from - XamlReader.Parse
/// builds an object graph with no such link on its own. Lives in this
/// assembly's own namespace, so referencing it in the injected XAML needs no
/// clr-namespace qualification of the user's own assembly.
/// </summary>
/// <remarks>
/// Public (not internal), and GetPath/SetPath must be public too - XamlReader's markup-time
/// type/member resolution requires public accessibility to resolve an attached property from
/// XAML text, even when the type lives in the same assembly doing the parsing. Confirmed by a
/// real failure: XamlReader.Parse threw "Cannot set unknown member '...Track.Path'" against
/// this exact type while it was still internal.
/// </remarks>
public static class Track
{
    public static readonly DependencyProperty PathProperty = DependencyProperty.RegisterAttached(
        "Path", typeof(string), typeof(Track), new PropertyMetadata(null));

    public static string? GetPath(DependencyObject obj) => (string?)obj.GetValue(PathProperty);

    public static void SetPath(DependencyObject obj, string? value) => obj.SetValue(PathProperty, value);
}
