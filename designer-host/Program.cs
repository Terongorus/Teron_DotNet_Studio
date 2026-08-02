using System.Windows;
using System.Windows.Threading;

namespace DesignerHost;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var pipeName = GetArgValue(args, "--pipe");
        if (pipeName is null)
        {
            Console.Error.WriteLine("Usage: DesignerHost --pipe <name>");
            return 1;
        }

        // OnExplicitShutdown: this app never shows a visible/user-closable
        // window, so the default "shut down when the last window closes"
        // policy would never fire on its own - the pipe's `shutdown` message
        // is the only intended exit path.
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };

        app.DispatcherUnhandledException += (_, e) =>
        {
            Console.Error.WriteLine($"Unhandled dispatcher exception: {e.Exception}");
            e.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            Console.Error.WriteLine($"Unhandled exception: {e.ExceptionObject}");
        };

        var renderHost = new RenderHost();
        var pipeServer = new PipeServer(pipeName, app.Dispatcher, renderHost);

        _ = pipeServer.RunAsync().ContinueWith(t =>
        {
            if (t.IsFaulted)
            {
                Console.Error.WriteLine($"Pipe server terminated unexpectedly: {t.Exception}");
                app.Dispatcher.Invoke(() => app.Shutdown());
            }
        }, TaskScheduler.Default);

        return app.Run();
    }

    private static string? GetArgValue(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == name)
            {
                return args[i + 1];
            }
        }
        return null;
    }
}
