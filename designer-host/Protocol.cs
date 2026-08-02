using System.Text.Json;
using System.Text.Json.Serialization;

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
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(LoadXamlMessage), "loadXaml")]
[JsonDerivedType(typeof(ShutdownMessage), "shutdown")]
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

internal sealed class ErrorMessage
{
    public string Type => "error";
    public required string RequestId { get; init; }
    public required string Message { get; init; }
    public string? Stack { get; init; }
}
