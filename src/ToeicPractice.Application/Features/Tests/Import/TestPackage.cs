using System.Text.Json.Serialization;

namespace ToeicPractice.Application.Features.Tests.Import;

/// <summary>
/// Cấu trúc file <c>test.json</c> trong gói đề (.zip) do Admin upload.
/// Đường dẫn audio/image là đường dẫn tương đối bên trong file zip,
/// hoặc URL tuyệt đối (http/https) nếu media đã được lưu trữ ở nơi khác.
/// </summary>
public class TestPackage
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>"Listening", "Reading", "Writing" hoặc "ListeningReading" (đề thi đủ Part 1–7).</summary>
    public string Skill { get; set; } = string.Empty;
    public int? DurationMinutes { get; set; }
    public bool Publish { get; set; }
    public List<PackageGroup> Groups { get; set; } = [];
}

public class PackageGroup
{
    /// <summary>1–4 (Listening) · 5–7 (Reading) · 11 = Writing Q1–5, 12 = Q6–7, 13 = Q8. Chấp nhận cả "L1".."L4", "W1".."W3".</summary>
    [JsonConverter(typeof(PartJsonConverter))]
    public int Part { get; set; }
    public string? Audio { get; set; }
    public string? Image { get; set; }
    public string? Passage { get; set; }
    public string? Transcript { get; set; }
    public List<PackageQuestion> Questions { get; set; } = [];
}

public class PackageQuestion
{
    public int Number { get; set; }
    public string? Content { get; set; }
    /// <summary>{"A": "...", "B": "...", ...}. Part 1–2 có thể bỏ trống nội dung.</summary>
    public Dictionary<string, string?>? Options { get; set; }
    public string? Answer { get; set; }
    public string? Explanation { get; set; }
    public List<string>? Keywords { get; set; }
    public string? SampleAnswer { get; set; }
    public int? MinWords { get; set; }
}
