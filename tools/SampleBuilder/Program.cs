using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using SampleBuilder;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Features.Tests;
using ToeicPractice.Application.Features.Tests.Import;

// Cách dùng:
//   dotnet run --project tools/SampleBuilder                  → xử lý mọi gói trong samples/
//   dotnet run --project tools/SampleBuilder -- listening-0   → chỉ các gói có tên bắt đầu bằng "listening-0"
//   thêm --force để tạo lại toàn bộ audio/ảnh kể cả khi file đã có.
Console.OutputEncoding = System.Text.Encoding.UTF8;
var force = args.Contains("--force");
var filters = args.Where(a => !a.StartsWith("--")).ToList();

var root = FindRepoRoot();
var samplesDir = Path.Combine(root, "samples");
var outDir = Path.Combine(root, "src", "ToeicPractice.Infrastructure", "Seed", "samples");
Directory.CreateDirectory(outDir);

var packs = Directory.GetDirectories(samplesDir)
    .Where(d => File.Exists(Path.Combine(d, "test.json")))
    .Where(d => filters.Count == 0 || filters.Any(f => Path.GetFileName(d).StartsWith(f, StringComparison.OrdinalIgnoreCase)))
    .OrderBy(d => d, StringComparer.OrdinalIgnoreCase)
    .ToList();

using var images = new ImageRenderer();
var studio = new VoiceStudio();
var failures = 0;

foreach (var pack in packs)
{
    var name = Path.GetFileName(pack);
    try
    {
        var test = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(pack, "test.json")),
            documentOptions: new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true })!;
        var built = 0;
        var seconds = 0.0;
        // Đề thi Listening & Reading đầy đủ: audio theo nhịp đề thật + hướng dẫn đầu mỗi Part.
        var fullExam = string.Equals((string?)test["skill"], "ListeningReading", StringComparison.OrdinalIgnoreCase);
        var groups = test["groups"]!.AsArray().Select(n => n!).ToList();
        var lastListening = groups.LastOrDefault(n => n["part"]!.GetValue<int>() <= 4);

        for (var gi = 0; gi < groups.Count; gi++)
        {
            var g = groups[gi];
            var part = g["part"]!.GetValue<int>();
            var cue = fullExam
                ? new ExamCue(gi == 0 || groups[gi - 1]["part"]!.GetValue<int>() != part, ReferenceEquals(g, lastListening))
                : null;

            if ((string?)g["image"] is { } image)
            {
                var dest = Path.Combine(pack, image);
                if (force || !File.Exists(dest))
                {
                    if (g["scene"] is JsonObject scene) images.RenderScene(scene, dest);
                    else if (g["graphic"] is JsonObject graphic) images.RenderGraphic(graphic, dest);
                    else throw new InvalidOperationException($"Thiếu file {image} và không có \"scene\"/\"graphic\" để vẽ.");
                    built++;
                }
            }

            if ((string?)g["audio"] is { } audio)
            {
                var dest = Path.Combine(pack, audio);
                if (force || !File.Exists(dest))
                {
                    seconds += await studio.RenderAsync(AudioScript.For(g, part, cue), dest);
                    built++;
                }
                else seconds += await VoiceStudio.DurationAsync(dest);
            }
        }

        Lint(test, name);
        var zipPath = Path.Combine(outDir, name + ".zip");
        WriteZip(pack, zipPath);
        var result = await Validate(zipPath);
        var audioNote = seconds > 0 ? $" · audio {TimeSpan.FromSeconds(seconds):mm\\:ss}" : "";
        Console.WriteLine($"✔ {name}: {result.QuestionCount} câu · {built} media mới{audioNote} · {new FileInfo(zipPath).Length / 1024} KB");
        foreach (var w in result.Warnings.Where(w => !w.StartsWith("Số câu khác đề thi thật")))
            Console.WriteLine($"    ⚠ {w}");
    }
    catch (Exception ex)
    {
        failures++;
        File.Delete(Path.Combine(outDir, name + ".zip")); // không để lại gói lỗi trong Seed/samples
        var errors = ex is ValidationAppException v ? string.Join("\n    ", v.Errors) : ex.Message;
        Console.WriteLine($"✘ {name}:\n    {errors}");
    }
}

Console.WriteLine($"\n{packs.Count - failures}/{packs.Count} gói đã đóng gói vào {outDir}");
return failures == 0 ? 0 : 1;

// ----------------------------------------------------------------------------------------------

static string FindRepoRoot()
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir != null && !File.Exists(Path.Combine(dir.FullName, "ToeicPractice.sln"))) dir = dir.Parent;
    return dir?.FullName ?? throw new InvalidOperationException("Không tìm thấy thư mục gốc (ToeicPractice.sln).");
}

// Chỉ đóng gói test.json + audio/ + images/ – bỏ qua file nháp khác trong thư mục gói.
static void WriteZip(string pack, string zipPath)
{
    if (File.Exists(zipPath)) File.Delete(zipPath);
    using var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create);
    zip.CreateEntryFromFile(Path.Combine(pack, "test.json"), "test.json", CompressionLevel.Optimal);
    foreach (var folder in new[] { "audio", "images" })
    {
        var dir = Path.Combine(pack, folder);
        if (!Directory.Exists(dir)) continue;
        foreach (var file in Directory.GetFiles(dir).OrderBy(f => f))
            zip.CreateEntryFromFile(file, $"{folder}/{Path.GetFileName(file)}", CompressionLevel.Optimal);
    }
}

// Dùng đúng bộ kiểm tra của tính năng "Nhập gói đề" (dry run không chạm tới CSDL/storage).
static async Task<ImportResultDto> Validate(string zipPath)
{
    await using var stream = File.OpenRead(zipPath);
    return await new TestImportService(null!, null!).ImportAsync(stream, Path.GetFileName(zipPath), dryRun: true, CancellationToken.None);
}

// Các lỗi soạn đề mà validate của ứng dụng không bắt được.
static void Lint(JsonNode test, string name)
{
    var errors = new List<string>();
    var answers = new List<string>();
    // PassageBox hiển thị "(123)", "----", "____" thành ô trống → không được xuất hiện ngoài chỗ trống thật.
    var fakeBlank = new Regex(@"\(\s*\d{3}\s*\)|-{4,}|_{4,}");
    var speaker = new Regex(@"^(W|M|W1|W2|M1|M2):\s");

    foreach (var g in test["groups"]!.AsArray().Select(n => n!))
    {
        var part = g["part"]!.GetValue<int>();
        var passage = (string?)g["passage"] ?? "";
        var questions = g["questions"]!.AsArray().Select(n => n!).ToList();
        foreach (var q in questions)
        {
            var n = q["number"]!.GetValue<int>();
            answers.Add((string?)q["answer"] ?? "?");
            var content = (string?)q["content"] ?? "";
            if (part == 5 && !content.Contains("-------")) errors.Add($"Câu {n}: Part 5 thiếu chỗ trống \"-------\".");
            if (part == 6 && !passage.Contains($"---{n}---")) errors.Add($"Câu {n}: đoạn văn Part 6 thiếu \"---{n}---\".");
            if (string.IsNullOrWhiteSpace((string?)q["explanation"])) errors.Add($"Câu {n}: thiếu giải thích.");
            if (part is 3 or 4 && content.StartsWith("Look at the graphic") && g["image"] is null)
                errors.Add($"Câu {n}: câu hỏi biểu đồ nhưng nhóm không có ảnh.");
        }
        if (part == 7 && fakeBlank.IsMatch(passage))
            errors.Add($"Câu {questions[0]!["number"]}: đoạn văn chứa \"{fakeBlank.Match(passage).Value}\" sẽ bị hiển thị thành ô trống.");
        if (part == 3)
        {
            var bad = ((string?)g["transcript"] ?? "").Split('\n').Where(l => l.Trim().Length > 0 && !speaker.IsMatch(l.Trim())).ToList();
            if (bad.Count > 0) errors.Add($"Câu {questions[0]!["number"]}: dòng hội thoại thiếu nhãn người nói: \"{bad[0]}\".");
        }
    }
    // Đề thi đầy đủ phải đánh số đúng như đề thật: đủ 200 câu, mỗi Part đúng dải số câu.
    if (string.Equals((string?)test["skill"], "ListeningReading", StringComparison.OrdinalIgnoreCase))
    {
        (int Part, int From, int To)[] official = [(1, 1, 6), (2, 7, 31), (3, 32, 70), (4, 71, 100), (5, 101, 130), (6, 131, 146), (7, 147, 200)];
        var numbered = test["groups"]!.AsArray().Select(n => n!)
            .SelectMany(g => g["questions"]!.AsArray().Select(q => (Part: g["part"]!.GetValue<int>(), Number: q!["number"]!.GetValue<int>())))
            .ToList();
        foreach (var (part, from, to) in official)
        {
            var nums = numbered.Where(x => x.Part == part).Select(x => x.Number).OrderBy(n => n).ToList();
            if (!nums.SequenceEqual(Enumerable.Range(from, to - from + 1)))
                errors.Add($"Part {part} phải gồm đúng các câu {from}–{to} (đang có {nums.Count} câu: {(nums.Count > 0 ? $"{nums[0]}–{nums[^1]}" : "trống")}).");
        }
    }
    if (errors.Count > 0) throw new ValidationAppException(errors);

    var spread = string.Join(" ", answers.GroupBy(a => a).OrderBy(a => a.Key).Select(a => $"{a.Key}:{a.Count()}"));
    Console.WriteLine($"  {name} – phân bố đáp án {spread}");
}
