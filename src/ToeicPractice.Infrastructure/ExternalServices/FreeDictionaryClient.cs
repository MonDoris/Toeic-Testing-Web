using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ToeicPractice.Application.Common.Interfaces;

namespace ToeicPractice.Infrastructure.ExternalServices;

/// <summary>
/// Thu thập phiên âm, âm thanh, định nghĩa, ví dụ và từ đồng nghĩa từ
/// Free Dictionary API (https://dictionaryapi.dev – dữ liệu từ Wiktionary, CC BY-SA).
/// </summary>
public class FreeDictionaryClient(HttpClient http, ILogger<FreeDictionaryClient> logger) : IDictionaryLookupService
{
    public async Task<DictionaryEntry?> LookupAsync(string word, CancellationToken ct = default)
    {
        try
        {
            using var response = await http.GetAsync($"api/v2/entries/en/{Uri.EscapeDataString(word.ToLowerInvariant())}", ct);
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0) return null;

            string? phonetic = null, audio = null, pos = null, definition = null, example = null;
            var synonyms = new List<string>();

            foreach (var entry in doc.RootElement.EnumerateArray())
            {
                phonetic ??= Str(entry, "phonetic");
                if (entry.TryGetProperty("phonetics", out var phonetics))
                    foreach (var p in phonetics.EnumerateArray())
                    {
                        phonetic ??= Str(p, "text");
                        var a = Str(p, "audio");
                        // Ưu tiên giọng Mỹ (-us.mp3) giống giọng đọc phổ biến trong đề TOEIC.
                        if (!string.IsNullOrEmpty(a) && (audio is null || a.Contains("-us.")))
                            audio = a;
                    }

                if (!entry.TryGetProperty("meanings", out var meanings)) continue;
                foreach (var m in meanings.EnumerateArray())
                {
                    var mPos = Str(m, "partOfSpeech");
                    if (m.TryGetProperty("synonyms", out var syn))
                        synonyms.AddRange(syn.EnumerateArray().Select(s => s.GetString()!).Where(s => s != null));
                    if (!m.TryGetProperty("definitions", out var defs)) continue;
                    foreach (var d in defs.EnumerateArray())
                    {
                        if (definition is null) { definition = Str(d, "definition"); pos = mPos; }
                        example ??= Str(d, "example");
                        if (d.TryGetProperty("synonyms", out var dsyn))
                            synonyms.AddRange(dsyn.EnumerateArray().Select(s => s.GetString()!).Where(s => s != null));
                    }
                }
            }

            return new DictionaryEntry(word, phonetic, audio, pos, definition, example,
                synonyms.Distinct(StringComparer.OrdinalIgnoreCase).Take(6).ToList(),
                "dictionaryapi.dev (Wiktionary, CC BY-SA)");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Dictionary lookup failed for {Word}", word);
            throw new Application.Common.Exceptions.ValidationAppException(
                "Không kết nối được tới nguồn từ điển trực tuyến. Vui lòng thử lại sau.");
        }
    }

    private static string? Str(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString()
            : null;
}
