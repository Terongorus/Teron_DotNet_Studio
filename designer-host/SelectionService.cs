using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace DesignerHost;

internal static class SelectionService
{
    public enum PositioningMode { Canvas, Margin }

    /// <summary>
    /// One cheap, 100%-accurate round trip against the real rendered visual tree - correct
    /// z-order/opacity/hit-test-visibility handling for free, unlike trying to reimplement
    /// any of that logic client-side. Walks up from the raw hit (which may land on
    /// template-internal chrome that was never in the Track.Path-injected document) until
    /// an ancestor carries a path, so template internals are naturally skipped.
    /// </summary>
    public static (FrameworkElement Element, string Path)? HitTest(Visual root, Point point)
    {
        var current = VisualTreeHelper.HitTest(root, point)?.VisualHit;
        while (current != null)
        {
            var path = Track.GetPath(current);
            if (path != null && current is FrameworkElement element)
            {
                return (element, path);
            }
            current = VisualTreeHelper.GetParent(current);
        }
        return null;
    }

    /// <summary>Relocates a previously hit-tested element by its path, e.g. to recompute bounds/mode at commit time without trusting anything the client echoed back.</summary>
    public static FrameworkElement? FindByPath(Visual root, string path)
    {
        if (Track.GetPath(root) == path && root is FrameworkElement rootElement) { return rootElement; }
        return FindByPathRecursive(root, path);
    }

    private static FrameworkElement? FindByPathRecursive(DependencyObject parent, string path)
    {
        var count = VisualTreeHelper.GetChildrenCount(parent);
        for (var i = 0; i < count; i++)
        {
            var child = VisualTreeHelper.GetChild(parent, i);
            if (Track.GetPath(child) == path && child is FrameworkElement element)
            {
                return element;
            }

            var found = FindByPathRecursive(child, path);
            if (found != null) { return found; }
        }
        return null;
    }

    /// <summary>
    /// Shared by both the selection response and the commit's "original bounds"
    /// computation - the commit path never trusts a client-echoed original, it always
    /// recomputes this fresh against the current render.
    /// </summary>
    public static Rect GetBounds(FrameworkElement element, Visual root)
    {
        var transform = element.TransformToAncestor(root);
        return transform.TransformBounds(new Rect(0, 0, element.ActualWidth, element.ActualHeight));
    }

    /// <summary>
    /// The *logical* parent (not the visual-tree parent used for hit-testing - a
    /// different tree walk, a different purpose): a Canvas-parented element gets true
    /// absolute positioning via Canvas.Left/Top; anything else falls back to an
    /// approximate Margin nudge.
    /// </summary>
    public static PositioningMode DeterminePositioningMode(FrameworkElement element) =>
        element.Parent is Canvas ? PositioningMode.Canvas : PositioningMode.Margin;
}
