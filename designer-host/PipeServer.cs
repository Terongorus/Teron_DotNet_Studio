using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;

namespace DesignerHost;

/// <summary>
/// Accepts a single client connection at a time over a named pipe, speaking
/// newline-delimited JSON. Re-listens after a client disconnects (rather than
/// exiting) so the extension can reconnect without restarting the process,
/// until an explicit shutdown message is received.
/// </summary>
internal sealed class PipeServer
{
    private readonly string _pipeName;
    private readonly Dispatcher _dispatcher;
    private readonly RenderHost _renderHost;

    public PipeServer(string pipeName, Dispatcher dispatcher, RenderHost renderHost)
    {
        _pipeName = pipeName;
        _dispatcher = dispatcher;
        _renderHost = renderHost;
    }

    public async Task RunAsync()
    {
        while (true)
        {
            using var pipe = new NamedPipeServerStream(_pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            await pipe.WaitForConnectionAsync();
            await SendAsync(pipe, new ReadyMessage());

            using var reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, leaveOpen: true);
            var shuttingDown = false;
            string? line;
            while (!shuttingDown && (line = await reader.ReadLineAsync()) != null)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                InboundMessage? message;
                try
                {
                    message = JsonSerializer.Deserialize<InboundMessage>(line, Protocol.JsonOptions);
                }
                catch (JsonException)
                {
                    continue;
                }

                switch (message)
                {
                    case LoadXamlMessage load:
                        await HandleLoadXamlAsync(pipe, load);
                        break;
                    case ShutdownMessage:
                        shuttingDown = true;
                        break;
                }
            }

            if (shuttingDown)
            {
                _dispatcher.Invoke(() => Application.Current.Shutdown());
                return;
            }
        }
    }

    private async Task HandleLoadXamlAsync(NamedPipeServerStream pipe, LoadXamlMessage load)
    {
        try
        {
            var (width, height, pngBase64) = await _dispatcher.InvokeAsync(() => _renderHost.Render(load.XamlText, load.FilePath, load.AssemblyPath, load.AppXamlText)).Task;
            await SendAsync(pipe, new FrameMessage { RequestId = load.RequestId, Width = width, Height = height, PngBase64 = pngBase64 });
        }
        catch (Exception ex)
        {
            await SendAsync(pipe, new ErrorMessage { RequestId = load.RequestId, Message = DescribeException(ex), Stack = ex.StackTrace });
        }
    }

    /// <summary>
    /// XamlParseException (and friends) almost always wrap the real cause in
    /// InnerException - the outer message alone ("Set property 'X' threw an
    /// exception") is rarely actionable on its own.
    /// </summary>
    private static string DescribeException(Exception ex)
    {
        var messages = new List<string>();
        for (var current = ex; current != null; current = current.InnerException)
        {
            messages.Add(current.Message);
        }
        return string.Join(" ---> ", messages);
    }

    private static async Task SendAsync(NamedPipeServerStream pipe, object message)
    {
        var json = JsonSerializer.Serialize(message, message.GetType(), Protocol.JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json + "\n");
        await pipe.WriteAsync(bytes);
        await pipe.FlushAsync();
    }
}
