// 더블클릭하면 CanvaCraft를 브라우저로 여는 단일 실행 파일.
// 앱 파일(dist)을 안에 품고 이 컴퓨터 안에서만 내준다. 인터넷이나 Node.js가 필요 없고 사진이 밖으로 나가지 않는다.
// Windows 10·11에 기본으로 있는 .NET Framework 4로 돌아간다. 빌드는 scripts/build-exe.mjs가 한다(C# 5).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("CanvaCraft")]
[assembly: AssemblyProduct("CanvaCraft")]

static class Launcher
{
    // 브라우저는 주소(포트 포함)별로 작품을 저장한다. 이 값을 바꾸면 저장된 작품이 보이지 않으므로 바꾸지 않는다.
    const int Port = 47831;
    const string Url = "http://127.0.0.1:47831/";
    const string ProbePath = "/__canvacraft_launcher";
    static readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
    static string buildId = "";

    [STAThread]
    static int Main(string[] args)
    {
        // 시험에서는 브라우저와 알림 창을 띄우지 않는다.
        bool quiet = args.Contains("--no-open");
        Application.EnableVisualStyles();
        TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
        listener.ExclusiveAddressUse = true;
        try
        {
            LoadFiles();
            listener.Start();
        }
        catch (SocketException)
        {
            return AlreadyRunning(quiet);
        }
        Thread server = new Thread(() => Serve(listener));
        server.IsBackground = true;
        server.Start();
        if (!quiet) OpenBrowser();
        RunTray();
        listener.Stop();
        return 0;
    }

    static void LoadFiles()
    {
        Assembly self = Assembly.GetExecutingAssembly();
        using (StreamReader reader = new StreamReader(self.GetManifestResourceStream("build.txt"))) buildId = reader.ReadToEnd().Trim();
        using (ZipArchive zip = new ZipArchive(self.GetManifestResourceStream("app.zip"), ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in zip.Entries)
            {
                if (entry.FullName.EndsWith("/")) continue;
                using (Stream input = entry.Open())
                using (MemoryStream output = new MemoryStream((int)entry.Length))
                {
                    input.CopyTo(output);
                    Files["/" + entry.FullName] = output.ToArray();
                }
            }
        }
    }

    // 포트가 이미 쓰이면 먼저 켜 둔 CanvaCraft인지 확인한다. 맞으면 그쪽을 연다.
    static int AlreadyRunning(bool quiet)
    {
        string running = Probe();
        if (running == buildId)
        {
            if (!quiet) OpenBrowser();
            return 0;
        }
        string message = running != null
            ? "이전 버전의 CanvaCraft가 켜져 있어요.\n오른쪽 아래 알림 영역의 CanvaCraft 아이콘에서 끝내기를 누른 뒤 다시 실행해 주세요."
            : "다른 프로그램이 CanvaCraft의 연결 번호(" + Port + ")를 쓰고 있어요.\n컴퓨터를 다시 켠 뒤 실행해 주세요.";
        if (!quiet) MessageBox.Show(message, "CanvaCraft", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return 2;
    }

    static string Probe()
    {
        try
        {
            // 포트를 쓰는 다른 프로그램이 응답하지 않아도 오래 기다리지 않는다.
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(Url.TrimEnd('/') + ProbePath);
            request.Proxy = null;
            request.Timeout = 3000;
            request.ReadWriteTimeout = 3000;
            using (WebResponse response = request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                string text = reader.ReadToEnd();
                return text.StartsWith("canvacraft ") ? text.Substring(11).Trim() : null;
            }
        }
        catch (WebException) { return null; }
    }

    static void OpenBrowser()
    {
        try { Process.Start(Url); }
        catch (Exception)
        {
            MessageBox.Show("브라우저를 열지 못했어요. 브라우저 주소 창에 아래 주소를 넣어 주세요.\n\n" + Url, "CanvaCraft", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    // 창이 없는 프로그램이라 알림 영역 아이콘으로 다시 열고 끝낸다.
    static void RunTray()
    {
        using (NotifyIcon tray = new NotifyIcon())
        using (ContextMenuStrip menu = new ContextMenuStrip())
        {
            menu.Items.Add("CanvaCraft 열기", null, (s, e) => OpenBrowser());
            menu.Items.Add("끝내기", null, (s, e) => Application.Exit());
            tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            tray.Text = "CanvaCraft";
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => OpenBrowser();
            tray.Visible = true;
            Application.Run();
            tray.Visible = false;
        }
    }

    static void Serve(TcpListener listener)
    {
        while (true)
        {
            TcpClient client;
            try { client = listener.AcceptTcpClient(); }
            catch (SocketException) { return; }
            catch (ObjectDisposedException) { return; }
            ThreadPool.QueueUserWorkItem(_ => Handle(client));
        }
    }

    static void Handle(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 30000;
                NetworkStream stream = client.GetStream();
                string head = ReadHead(stream);
                if (head != null) Respond(stream, head);
            }
            catch (IOException) { /* 브라우저가 연결을 끊었다. */ }
            catch (SocketException) { }
        }
    }

    static string ReadHead(NetworkStream stream)
    {
        byte[] buffer = new byte[8192];
        int length = 0;
        while (length < buffer.Length)
        {
            int read = stream.Read(buffer, length, buffer.Length - length);
            if (read <= 0) return null;
            length += read;
            string text = Encoding.ASCII.GetString(buffer, 0, length);
            if (text.Contains("\r\n\r\n")) return text;
        }
        return null;
    }

    static void Respond(NetworkStream stream, string head)
    {
        string[] lines = head.Split(new[] { "\r\n" }, StringSplitOptions.None);
        string[] request = lines[0].Split(' ');
        if (request.Length != 3) { Send(stream, 400, "text/plain", new byte[0], false, false); return; }
        bool isHead = request[0] == "HEAD";
        if (request[0] != "GET" && !isHead) { Send(stream, 405, "text/plain", new byte[0], false, false); return; }

        // 다른 사이트가 주소를 속여 이 서버를 읽지 못하게 이 주소로 온 요청만 받는다.
        string host = lines.Where(line => line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase)).Select(line => line.Substring(5).Trim().ToLowerInvariant()).FirstOrDefault();
        if (host != "127.0.0.1:" + Port && host != "localhost:" + Port) { Send(stream, 403, "text/plain", new byte[0], false, false); return; }

        string path = request[1];
        int query = path.IndexOf('?');
        if (query >= 0) path = path.Substring(0, query);
        path = Uri.UnescapeDataString(path);
        if (path == ProbePath) { Send(stream, 200, "text/plain", Encoding.ASCII.GetBytes("canvacraft " + buildId), isHead, false); return; }
        if (path == "/") path = "/index.html";

        byte[] body;
        if (!Files.TryGetValue(path, out body)) { Send(stream, 404, "text/plain", new byte[0], isHead, false); return; }
        Send(stream, 200, TypeOf(path), body, isHead, path.StartsWith("/assets/"));
    }

    static void Send(NetworkStream stream, int status, string type, byte[] body, bool headOnly, bool immutable)
    {
        string reason = status == 200 ? "OK" : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" : "Bad Request";
        string cache = immutable ? "public, max-age=31536000, immutable" : "no-cache";
        string header = "HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length
            + "\r\nCache-Control: " + cache + "\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: frame-ancestors 'none'\r\nConnection: close\r\n\r\n";
        byte[] bytes = Encoding.ASCII.GetBytes(header);
        stream.Write(bytes, 0, bytes.Length);
        if (!headOnly && body.Length > 0) stream.Write(body, 0, body.Length);
    }

    static string TypeOf(string path)
    {
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".png": return "image/png";
            case ".jpg": return "image/jpeg";
            case ".svg": return "image/svg+xml";
            case ".woff2": return "font/woff2";
            case ".txt": return "text/plain; charset=utf-8";
            default: return "application/octet-stream";
        }
    }
}
