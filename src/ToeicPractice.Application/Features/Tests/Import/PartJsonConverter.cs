using System.Text.Json;
using System.Text.Json.Serialization;

namespace ToeicPractice.Application.Features.Tests.Import;

/// <summary>Đọc Part dạng số (3) hoặc dạng chữ ("L3", "Part 3", "W2").</summary>
public class PartJsonConverter : JsonConverter<int>
{
    public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32();
        var raw = reader.GetString()?.Trim().ToUpperInvariant().Replace("PART", "").Trim() ?? "";
        if (int.TryParse(raw, out var n)) return n;
        if (raw.Length == 2 && int.TryParse(raw[1..], out var idx))
        {
            if (raw[0] is 'L' or 'R' or 'P') return idx; // L1–L4, R5–R7, P1–P7
            if (raw[0] == 'W') return 10 + idx;
        }
        return 0;
    }

    public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options) =>
        writer.WriteNumberValue(value);
}
