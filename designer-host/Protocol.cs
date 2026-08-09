using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;

namespace DesignerHost;

/// <summary>
/// Shared JSON options for the pipe protocol - must mirror the TypeScript side
/// (src/xamlDesigner/designerHostProtocol.ts) exactly, since messages are
/// hand-kept in sync across the two languages rather than generated.
/// </summary>
internal static class Protocol
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
}

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(LoadXamlMessage), "loadXaml")]
[JsonDerivedType(typeof(ShutdownMessage), "shutdown")]
[JsonDerivedType(typeof(SelectAtMessage), "selectAt")]
[JsonDerivedType(typeof(CommitTransformMessage), "commitTransform")]
internal abstract class InboundMessage
{
}

internal sealed class LoadXamlMessage : InboundMessage
{
    public string RequestId { get; set; } = "";
    public string XamlText { get; set; } = "";
    public string? FilePath { get; set; }
    public string? AssemblyPath { get; set; }
    public string? AppXamlText { get; set; }
}

internal sealed class ShutdownMessage : InboundMessage
{
}

internal sealed class SelectAtMessage : InboundMessage
{
    public string RequestId { get; set; } = "";
    /// <summary>Identifies which of this process's (possibly several, one per open panel) rendered documents to hit-test against - see RenderHost.DocumentState.</summary>
    public string? FilePath { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
}

internal sealed class CommitTransformMessage : InboundMessage
{
    public string RequestId { get; set; } = "";
    /// <summary>Identifies which of this process's (possibly several, one per open panel) rendered documents to commit against - see RenderHost.DocumentState.</summary>
    public string? FilePath { get; set; }
    public string Path { get; set; } = "";
    public TransformKind Kind { get; set; }
    public BoundsDto Bounds { get; set; } = new();
}

/// <summary>Plain data shape for a System.Windows.Rect crossing the wire - kept separate from Rect itself so the JSON shape stays exactly {x,y,width,height} regardless of how WPF's own type happens to serialize.</summary>
internal sealed class BoundsDto
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }

    public Rect ToRect() => new(X, Y, Width, Height);

    public static BoundsDto FromRect(Rect rect) => new() { X = rect.X, Y = rect.Y, Width = rect.Width, Height = rect.Height };
}

internal sealed class ReadyMessage
{
    public string Type => "ready";
}

internal sealed class FrameMessage
{
    public string Type => "frame";
    public required string RequestId { get; init; }
    public required int Width { get; init; }
    public required int Height { get; init; }
    public required string PngBase64 { get; init; }
}

/// <summary>Sent in reply to selectAt. Path/Bounds are both null when the point hit nothing trackable (e.g. empty canvas background) - the client treats that as "clear any selection", not an error.</summary>
internal sealed class SelectionMessage
{
    public string Type => "selection";
    public required string RequestId { get; init; }
    public string? Path { get; init; }
    public BoundsDto? Bounds { get; init; }
}

internal sealed class TransformResultMessage
{
    public string Type => "transformResult";
    public required string RequestId { get; init; }
    public required int Width { get; init; }
    public required int Height { get; init; }
    public required string PngBase64 { get; init; }
    /// <summary>The real file content to write back through VS Code's document API - this process never touches the file on disk itself.</summary>
    public required string XamlText { get; init; }
}

internal sealed class ErrorMessage
{
    public string Type => "error";
    public required string RequestId { get; init; }
    public required string Message { get; init; }
    public string? Stack { get; init; }
}
