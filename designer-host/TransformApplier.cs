using System.Globalization;
using System.Windows;
using System.Xml.Linq;

namespace DesignerHost;

internal enum TransformKind { Move, Resize }

/// <summary>
/// Writes a hit-tested drag/resize result back into the pristine (real, unstripped)
/// XElement. The webview only ever reports "moved from bounds A to bounds B" in device
/// pixels - this decides what that means for the actual XAML.
/// </summary>
internal static class TransformApplier
{
    /// <summary>Below this, a delta is treated as coordinate-mapping/float noise rather than a real move - avoids writing spurious near-zero position changes.</summary>
    private const double MinMeaningfulDelta = 0.5;

    public static void Apply(XElement pristineElement, SelectionService.PositioningMode mode, TransformKind kind, Rect originalBounds, Rect newBounds)
    {
        var deltaX = newBounds.X - originalBounds.X;
        var deltaY = newBounds.Y - originalBounds.Y;

        if (Math.Abs(deltaX) >= MinMeaningfulDelta || Math.Abs(deltaY) >= MinMeaningfulDelta)
        {
            if (mode == SelectionService.PositioningMode.Canvas)
            {
                ApplyCanvasPosition(pristineElement, deltaX, deltaY);
            }
            else
            {
                ApplyMarginPosition(pristineElement, deltaX, deltaY);
            }
        }

        // Resize (either panel type): Width/Height are set directly, independent of the
        // positioning mode above - opposite-corner-anchored resizes naturally also move
        // the element, which the position-delta branch above already applies.
        if (kind == TransformKind.Resize)
        {
            pristineElement.SetAttributeValue("Width", FormatNumber(newBounds.Width));
            pristineElement.SetAttributeValue("Height", FormatNumber(newBounds.Height));
        }
    }

    private static void ApplyCanvasPosition(XElement element, double deltaX, double deltaY)
    {
        var left = ReadNumber(element, "Canvas.Left") + deltaX;
        var top = ReadNumber(element, "Canvas.Top") + deltaY;
        element.SetAttributeValue("Canvas.Left", FormatNumber(left));
        element.SetAttributeValue("Canvas.Top", FormatNumber(top));
    }

    /// <summary>
    /// Approximate nudge, not true repositioning: only Left/Top are adjusted by the
    /// delta, Right/Bottom are left as-is. Documented 1b limitation - this fights with
    /// stretch/centered alignment, where Left/Top aren't what actually controls position.
    /// </summary>
    private static void ApplyMarginPosition(XElement element, double deltaX, double deltaY)
    {
        var margin = ReadMargin(element);
        var updated = new Thickness(margin.Left + deltaX, margin.Top + deltaY, margin.Right, margin.Bottom);
        element.SetAttributeValue("Margin", FormatThickness(updated));
    }

    private static double ReadNumber(XElement element, string attributeName)
    {
        var value = element.Attribute(attributeName)?.Value;
        return value != null && double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
    }

    /// <summary>
    /// Hand-rolled rather than ThicknessConverter: XAML's own uniform-value ("15") and
    /// four-value ("1,2,3,4") Thickness syntaxes are simple enough to parse directly,
    /// and this sidesteps ThicknessConverter's ambient-culture behavior entirely - this
    /// process's culture is real (not invariant-globalization, per the .csproj), so
    /// letting a converter guess at decimal separators is a real corruption risk here.
    /// </summary>
    private static Thickness ReadMargin(XElement element)
    {
        var value = element.Attribute("Margin")?.Value;
        if (string.IsNullOrEmpty(value)) { return default; }

        var parts = value.Split(',', StringSplitOptions.TrimEntries);
        var numbers = new double[parts.Length];
        for (var i = 0; i < parts.Length; i++)
        {
            if (!double.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out numbers[i])) { return default; }
        }

        return numbers.Length switch
        {
            1 => new Thickness(numbers[0]),
            4 => new Thickness(numbers[0], numbers[1], numbers[2], numbers[3]),
            _ => default
        };
    }

    private static string FormatThickness(Thickness thickness) =>
        $"{FormatNumber(thickness.Left)},{FormatNumber(thickness.Top)},{FormatNumber(thickness.Right)},{FormatNumber(thickness.Bottom)}";

    /// <summary>Rounded to whole pixels and formatted with InvariantCulture - avoids both float noise ("123.00000004") and a locale where "," is the decimal separator corrupting the comma-delimited Thickness syntax above.</summary>
    private static string FormatNumber(double value) =>
        Math.Round(value, MidpointRounding.AwayFromZero).ToString("0", CultureInfo.InvariantCulture);
}
