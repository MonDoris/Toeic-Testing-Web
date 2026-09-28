using System.Text;
using ToeicPractice.Application.Common.Exceptions;

namespace ToeicPractice.Application.Features.Vocabularies;

/// <summary>
/// Đọc file CSV (UTF-8, có dòng tiêu đề). Cột bắt buộc: word, meaningVi, topic.
/// Cột tuỳ chọn: phonetic, partOfSpeech, definitionEn, example, exampleVi, synonyms, level, audioUrl, source.
/// </summary>
public static class VocabularyCsvParser
{
    public static async Task<List<VocabularyRequest>> ParseAsync(Stream stream, CancellationToken ct)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var text = await reader.ReadToEndAsync(ct);
        var rows = ParseRows(text);
        if (rows.Count < 2) throw new ValidationAppException("File CSV không có dữ liệu.");

        var header = rows[0].Select(h => h.Trim().ToLowerInvariant()).ToList();
        int Col(string name) => header.IndexOf(name.ToLowerInvariant());
        foreach (var required in new[] { "word", "meaningvi", "topic" })
            if (Col(required) < 0) throw new ValidationAppException($"CSV thiếu cột bắt buộc \"{required}\".");

        string? Get(List<string> row, string name)
        {
            var i = Col(name);
            return i >= 0 && i < row.Count && !string.IsNullOrWhiteSpace(row[i]) ? row[i].Trim() : null;
        }

        return rows.Skip(1)
            .Where(r => r.Any(c => !string.IsNullOrWhiteSpace(c)))
            .Select(r => new VocabularyRequest(
                Get(r, "word") ?? "",
                Get(r, "phonetic"),
                Get(r, "partOfSpeech"),
                Get(r, "meaningVi") ?? "",
                Get(r, "definitionEn"),
                Get(r, "example"),
                Get(r, "exampleVi"),
                Get(r, "synonyms"),
                Get(r, "topic") ?? "",
                int.TryParse(Get(r, "level"), out var lv) ? lv : 450,
                Get(r, "audioUrl"),
                Get(r, "source")))
            .ToList();
    }

    /// <summary>RFC 4180: hỗ trợ dấu phẩy, xuống dòng và "" bên trong ô có ngoặc kép.</summary>
    private static List<List<string>> ParseRows(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else if (c == '"') inQuotes = false;
                else cell.Append(c);
                continue;
            }
            switch (c)
            {
                case '"': inQuotes = true; break;
                case ',': row.Add(cell.ToString()); cell.Clear(); break;
                case '\r': break;
                case '\n': row.Add(cell.ToString()); cell.Clear(); rows.Add(row); row = []; break;
                default: cell.Append(c); break;
            }
        }
        if (cell.Length > 0 || row.Count > 0) { row.Add(cell.ToString()); rows.Add(row); }
        return rows;
    }
}
