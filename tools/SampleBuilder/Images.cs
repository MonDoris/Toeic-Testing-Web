using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json.Nodes;

namespace SampleBuilder;

/// <summary>
/// Vẽ ảnh bằng Microsoft Edge headless: HTML/CSS → PNG.
/// <list type="bullet">
/// <item><b>scene</b> (Part 1): nền dựng sẵn + các vật thể emoji và hình khối.</item>
/// <item><b>graphic</b> (Part 3/4 "Look at the graphic"): bảng, biểu đồ cột, sơ đồ tầng, thẻ thông tin.</item>
/// </list>
/// </summary>
public sealed class ImageRenderer : IDisposable
{
    private readonly string _edge = FindBrowser();
    private readonly string _work = Directory.CreateTempSubdirectory("toeic-images-").FullName;

    // ------------------------------------------------------------------ scene (Part 1)
    //
    // "scene": { "bg": "office", "items": [ ... ] } – mỗi item là một chuỗi, vẽ theo thứ tự (sau đè trước):
    //   "🪑 400 420 120 [flip] [r-15] [o.6]"   emoji: tâm ngang x, đáy y, cỡ chữ; lật ngang / xoay (độ) / độ mờ
    //   "#rect x y w h màu [bo-góc]"           hình chữ nhật (bàn, kệ, quầy, bảng…)
    //   "#ellipse x y w h màu"                 hình elip
    //   "#dome x y w h màu"                    nửa elip phía trên (tán ô, mái vòm)
    //   "#shadow x y w"                         bóng đổ mờ dưới vật thể, tâm (x, y)
    //   "#text x y cỡ màu nội dung…"           chữ (biển hiệu, bảng trắng)
    public void RenderScene(JsonObject scene, string dest)
    {
        var sb = new StringBuilder();
        sb.Append(Background((string?)scene["bg"] ?? "plain"));
        foreach (var item in scene["items"]?.AsArray().Select(i => (string)i!) ?? [])
            sb.Append(Item(item));
        Render(Page(800, 540, sb.ToString()), dest, 800, 540);
    }

    private static string Item(string spec)
    {
        var t = spec.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        string N(int i) => t[i];
        switch (t[0])
        {
            case "#rect":
                return Div($"left:{N(1)}px;top:{N(2)}px;width:{N(3)}px;height:{N(4)}px;background:{N(5)};border-radius:{(t.Length > 6 ? N(6) : "0")}px");
            case "#ellipse":
                return Div($"left:{N(1)}px;top:{N(2)}px;width:{N(3)}px;height:{N(4)}px;background:{N(5)};border-radius:50%");
            case "#dome": // nửa elip phía trên: tán ô, mái vòm
                return Div($"left:{N(1)}px;top:{N(2)}px;width:{N(3)}px;height:{N(4)}px;background:{N(5)};border-radius:50% 50% 0 0/100% 100% 0 0");
            case "#shadow":
            {
                var w = int.Parse(N(3));
                return Div($"left:{int.Parse(N(1)) - w / 2}px;top:{int.Parse(N(2)) - w / 12}px;width:{w}px;height:{w / 6}px;border-radius:50%;background:radial-gradient(rgba(40,50,70,.28),rgba(40,50,70,0) 70%)");
            }
            case "#text":
                return $"<div class=\"t\" style=\"left:{N(1)}px;top:{N(2)}px;font-size:{N(3)}px;color:{N(4)}\">{Html(string.Join(' ', t.Skip(5)))}</div>";
            default:
            {
                var transform = new StringBuilder("translate(-50%,-100%)");
                var opacity = "1";
                foreach (var flag in t.Skip(4))
                {
                    if (flag == "flip") transform.Append(" scaleX(-1)");
                    else if (flag.StartsWith('r')) transform.Append($" rotate({flag[1..]}deg)");
                    else if (flag.StartsWith('o')) opacity = flag[1..];
                }
                return $"<div class=\"e\" style=\"left:{N(1)}px;top:{N(2)}px;font-size:{N(3)}px;opacity:{opacity};transform:{transform}\">{t[0]}</div>";
            }
        }
    }

    private static string Div(string style) => $"<div style=\"{style}\"></div>";

    // Nền 800×540 cho các bối cảnh hay gặp trong Part 1.
    private static string Background(string name)
    {
        const string sky = "linear-gradient(#a9d4f5,#e6f3fc)";
        string R(int x, int y, int w, int h, string bg, int r = 0) => Div($"left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};border-radius:{r}px");
        return name switch
        {
            "office" => R(0, 0, 800, 390, "#e6ecf3") + R(0, 390, 800, 150, "#bac4d0") + R(0, 382, 800, 10, "#cbd3de")
                        + R(64, 56, 232, 178, "#fff", 4) + R(74, 66, 212, 158, sky) + R(176, 66, 8, 158, "#fff"),
            "meeting" => R(0, 0, 800, 390, "#efe9e0") + R(0, 390, 800, 150, "#a8927a") + R(0, 382, 800, 10, "#d8ccbc")
                         + R(250, 46, 300, 176, "#8d97a6", 6) + R(258, 54, 284, 160, "#fff", 3),
            "kitchen" => R(0, 0, 800, 400, "repeating-linear-gradient(90deg,#f4efe6 0 58px,#e2dccf 58px 60px),#f4efe6")
                         + R(0, 0, 800, 400, "repeating-linear-gradient(0deg,transparent 0 58px,rgba(0,0,0,.07) 58px 60px)")
                         + R(0, 400, 800, 140, "#b9a58c"),
            "store" => R(0, 0, 800, 400, "#f6f1e7") + R(0, 400, 800, 140, "repeating-linear-gradient(90deg,#ddd2c1 0 98px,#cfc3b0 98px 100px)"),
            "warehouse" => R(0, 0, 800, 380, "repeating-linear-gradient(90deg,#c8cdd3 0 78px,#b9bfc6 78px 80px)")
                           + R(0, 380, 800, 160, "#a5a8ac") + R(0, 470, 800, 8, "#f2c94c"),
            "street" => R(0, 0, 800, 300, sky) + R(30, 90, 140, 210, "#c9d3dd") + R(190, 140, 120, 160, "#b5c2cf")
                        + R(520, 70, 160, 230, "#c3cdd8") + R(690, 150, 110, 150, "#b1bdca")
                        + R(0, 300, 800, 72, "#d3d3d3") + R(0, 372, 800, 10, "#a9a9a9") + R(0, 382, 800, 158, "#5b5f66")
                        + R(0, 458, 800, 6, "repeating-linear-gradient(90deg,#f5f5f5 0 60px,transparent 60px 110px)"),
            "park" => R(0, 0, 800, 300, sky) + R(0, 300, 800, 240, "#93c77e") + R(0, 300, 800, 30, "#86bb71"),
            "harbor" => R(0, 0, 800, 250, sky) + R(0, 250, 800, 290, "linear-gradient(#5c9fcf,#3f7fae)")
                        + R(0, 250, 800, 290, "repeating-linear-gradient(0deg,transparent 0 22px,rgba(255,255,255,.12) 22px 24px)"),
            "dock" => R(0, 0, 800, 250, sky) + R(0, 250, 800, 290, "linear-gradient(#5c9fcf,#3f7fae)")
                      + R(0, 430, 800, 110, "repeating-linear-gradient(90deg,#a07c56 0 58px,#8a6947 58px 60px)"),
            "station" => R(0, 0, 800, 56, "#6f7a86") + R(0, 56, 800, 280, "#dde3e8") + R(0, 336, 800, 92, "#c2c2c2")
                         + R(0, 414, 800, 12, "#f2c94c") + R(0, 428, 800, 112, "#7b6e62")
                         + R(0, 462, 800, 6, "#9aa3ad") + R(0, 510, 800, 6, "#9aa3ad"),
            "lobby" => R(0, 0, 800, 400, "#ede3d6") + R(0, 400, 800, 140, "repeating-linear-gradient(90deg,#cbb89f 0 118px,#bca88e 118px 120px)"),
            "beach" => R(0, 0, 800, 230, sky) + R(0, 230, 800, 100, "#5ba7d6") + R(0, 330, 800, 210, "#eed9a8"),
            "patio" => R(0, 0, 800, 190, sky) + R(0, 190, 800, 200, "#e9d8c4") + R(80, 225, 120, 110, "#b9d6ea", 4)
                       + R(600, 225, 120, 110, "#b9d6ea", 4) + R(0, 390, 800, 150, "repeating-linear-gradient(90deg,#cdbfae 0 78px,#bfb09e 78px 80px)"),
            "library" => R(0, 0, 800, 410, "#efe7da") + R(0, 410, 800, 130, "#b89f84"),
            "site" => R(0, 0, 800, 300, sky) + R(0, 300, 800, 240, "#c9a97a") + R(0, 300, 800, 20, "#b8966a"),
            _ => R(0, 0, 800, 400, "#eef1f5") + R(0, 400, 800, 140, "#d5dae1"),
        };
    }

    // ------------------------------------------------------------------ graphic (Part 3/4)
    //
    // "graphic": { "type": "table", "title": "...", "head": [...], "rows": [[...]], "note": "..." }
    //            { "type": "bars",  "title": "...", "unit": "...", "data": [["Jan", 20], ...] }
    //            { "type": "map",   "title": "...", "cells": [["Room A", "", "Lobby"], ...] }   ("" = hành lang)
    //            { "type": "card",  "title": "...", "lines": ["...", "..."], "note": "..." }
    public void RenderGraphic(JsonObject g, string dest)
    {
        var type = (string?)g["type"] ?? "table";
        var title = Html((string?)g["title"] ?? "");
        var note = (string?)g["note"] is { } n ? $"<p class=\"note\">{Html(n)}</p>" : "";
        var body = type switch
        {
            "table" => Table(g),
            "bars" => Bars(g),
            "map" => Map(g),
            "card" => string.Concat((g["lines"]?.AsArray() ?? []).Select(l => $"<p class=\"line\">{Html((string)l!)}</p>")),
            _ => throw new InvalidOperationException($"Loại graphic \"{type}\" không hỗ trợ.")
        };
        var html = $"<div class=\"g g-{type}\"><h1>{title}</h1>{body}{note}</div>";
        Render(Page(800, 500, html, graphic: true), dest, 800, 500);
    }

    private static string Table(JsonObject g)
    {
        var sb = new StringBuilder("<table>");
        if (g["head"] is JsonArray head)
            sb.Append("<tr>").Append(string.Concat(head.Select(h => $"<th>{Html((string)h!)}</th>"))).Append("</tr>");
        foreach (var row in g["rows"]!.AsArray())
            sb.Append("<tr>").Append(string.Concat(row!.AsArray().Select(c => $"<td>{Html(c!.ToString())}</td>"))).Append("</tr>");
        return sb.Append("</table>").ToString();
    }

    private static string Bars(JsonObject g)
    {
        var data = g["data"]!.AsArray().Select(d => (Label: (string)d![0]!, Value: d[1]!.GetValue<double>())).ToList();
        var max = data.Max(d => d.Value);
        var unit = (string?)g["unit"] ?? "";
        var bars = string.Concat(data.Select(d =>
            $"<div class=\"bar\"><span class=\"v\">{d.Value.ToString(CultureInfo.InvariantCulture)}{Html(unit)}</span>" +
            $"<div class=\"fill\" style=\"height:{(int)(d.Value / max * 220)}px\"></div></div>"));
        var labels = string.Concat(data.Select(d => $"<span>{Html(d.Label)}</span>"));
        return $"<div class=\"bars\">{bars}</div><div class=\"labels\">{labels}</div>";
    }

    private static string Map(JsonObject g)
    {
        var rows = g["cells"]!.AsArray();
        var cols = rows.Max(r => r!.AsArray().Count);
        var cells = string.Concat(rows.SelectMany(r => r!.AsArray()).Select(c =>
        {
            var text = (string)c!;
            return text.Length == 0 ? "<div class=\"hall\"></div>" : $"<div class=\"room\">{Html(text)}</div>";
        }));
        return $"<div class=\"map\" style=\"grid-template-columns:repeat({cols},1fr)\">{cells}</div>";
    }

    // ------------------------------------------------------------------ render

    private static string Page(int w, int h, string body, bool graphic = false) => $$"""
        <!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;width:{{w}}px;height:{{h}}px;overflow:hidden;background:{{(graphic ? "#eef1f5" : "#fff")}}}
        .s{position:relative;width:{{w}}px;height:{{h}}px;overflow:hidden}
        .s>div{position:absolute}
        .e{font-family:'Segoe UI Emoji';line-height:1;white-space:nowrap}
        .t{font-family:'Segoe UI',Arial,sans-serif;font-weight:700;white-space:nowrap}
        .wrap{display:flex;align-items:center;justify-content:center;width:{{w}}px;height:{{h}}px}
        .g{background:#fff;border:2px solid #1f2937;border-radius:14px;padding:22px 30px;min-width:440px;max-width:700px;
           font-family:'Segoe UI',Arial,sans-serif;color:#111827;box-shadow:0 6px 0 #1f2937}
        h1{margin:0 0 14px;font-size:26px;text-align:center;letter-spacing:.3px}
        table{border-collapse:collapse;width:100%;font-size:21px}
        th{background:#1f2937;color:#fff;font-weight:600}
        th,td{border:1.5px solid #9ca3af;padding:7px 14px;text-align:left}
        tr:nth-child(even) td{background:#f3f4f6}
        .note{margin:12px 0 0;font-size:17px;color:#4b5563;text-align:center;font-style:italic}
        .line{margin:6px 0;font-size:22px;text-align:center}
        .g-card .line:first-of-type{font-size:30px;font-weight:800;color:#b91c1c}
        .bars,.labels{display:flex;justify-content:center;gap:24px}
        .bars{align-items:flex-end;height:260px;border-bottom:2px solid #1f2937}
        .bar{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:88px;height:100%}
        .fill{width:64px;background:#3b82f6;border-radius:6px 6px 0 0}
        .v{font-size:18px;font-weight:700;margin-bottom:4px}
        .labels span{width:88px;text-align:center;font-size:18px;margin-top:6px}
        .map{display:grid;gap:6px;background:#e5e7eb;padding:6px;border-radius:8px;min-width:560px}
        .room{background:#fff;border:2px solid #374151;border-radius:6px;min-height:78px;display:flex;align-items:center;
              justify-content:center;text-align:center;font-size:20px;font-weight:600;padding:4px}
        .hall{background:repeating-linear-gradient(45deg,#e5e7eb 0 8px,#d1d5db 8px 16px);border-radius:6px;min-height:78px}
        </style></head><body>{{(graphic ? $"<div class=\"wrap\">{body}</div>" : $"<div class=\"s\">{body}</div>")}}</body></html>
        """;

    private void Render(string html, string dest, int w, int h)
    {
        var page = Path.Combine(_work, $"{Guid.NewGuid():N}.html");
        var png = Path.ChangeExtension(page, ".png");
        File.WriteAllText(page, html, Encoding.UTF8);

        var psi = new ProcessStartInfo(_edge)
        {
            UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true, CreateNoWindow = true
        };
        foreach (var a in new[]
                 {
                     "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                     "--no-first-run", $"--user-data-dir={Path.Combine(_work, "profile")}",
                     $"--window-size={w},{h}", $"--screenshot={png}", new Uri(page).AbsoluteUri
                 })
            psi.ArgumentList.Add(a);

        using var p = Process.Start(psi)!;
        p.StandardOutput.ReadToEndAsync();
        p.StandardError.ReadToEndAsync();
        if (!p.WaitForExit(60_000)) { p.Kill(true); throw new TimeoutException("Edge không phản hồi khi vẽ ảnh."); }
        if (!File.Exists(png)) throw new InvalidOperationException("Edge không tạo được ảnh chụp.");

        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
        File.Copy(png, dest, overwrite: true);
        File.Delete(page);
        File.Delete(png);
    }

    private static string Html(string s) => WebUtility.HtmlEncode(s);

    private static string FindBrowser()
    {
        var candidates = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + @"\Microsoft\Edge\Application\msedge.exe",
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Microsoft\Edge\Application\msedge.exe",
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Google\Chrome\Application\chrome.exe",
        };
        return candidates.FirstOrDefault(File.Exists)
               ?? throw new InvalidOperationException("Cần Microsoft Edge hoặc Google Chrome để vẽ ảnh đề.");
    }

    public void Dispose()
    {
        try { Directory.Delete(_work, recursive: true); } catch (IOException) { /* Edge có thể còn giữ profile */ }
    }
}
