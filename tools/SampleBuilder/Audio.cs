using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Windows.Media.MediaProperties;
using Windows.Media.SpeechSynthesis;
using Windows.Media.Transcoding;
using Windows.Storage;
using Windows.Storage.Streams;

namespace SampleBuilder;

/// <summary>Một câu thoại: vai đọc (N = người dẫn, W/M/W1/W2/M1/M2), nội dung, khoảng lặng sau đó.</summary>
public record Line(string Role, string Text, int PauseMs);

/// <summary>
/// Vị trí của nhóm câu trong đề thi Listening &amp; Reading đầy đủ: bật nhịp độ chuẩn (5 giây sau Part 1–2,
/// 8 giây sau mỗi câu Part 3–4), đọc hướng dẫn ở đầu mỗi Part và lời kết thúc phần Listening.
/// </summary>
public record ExamCue(bool FirstOfPart, bool EndOfListening);

/// <summary>Dựng kịch bản audio từ nhóm câu trong test.json, theo đúng trình tự đề thi thật.</summary>
public static class AudioScript
{
    private static readonly Regex Label = new(@"^(W|M|W1|W2|M1|M2):\s*(.+)$");

    // Hướng dẫn đọc ở đầu mỗi Part của đề thi đầy đủ (biên soạn riêng theo đúng nội dung hướng dẫn của đề thi).
    private static readonly Dictionary<int, string[]> Directions = new()
    {
        [1] =
        [
            "Listening test.",
            "In this section, you will show how well you understand spoken English. There are four parts, and the whole section lasts about forty-five minutes. Directions are given at the start of each part. Every recording is played only one time. Mark your answers on your answer sheet.",
            "Part 1. Photographs.",
            "For each question in this part, look at the picture in your test book. You will hear four statements about the picture. The statements are not printed, and you will hear them only once. Choose the statement that best describes what you see in the picture.",
        ],
        [2] =
        [
            "Part 2. Question and response.",
            "In this part, you will hear a question or a statement, followed by three responses. None of them are printed in your test book, and you will hear them only once. Choose the best response to the question or statement.",
        ],
        [3] =
        [
            "Part 3. Conversations.",
            "In this part, you will hear conversations between two or more people. After each conversation, you will hear three questions about what the speakers say. The questions and answer choices are printed in your test book. Choose the best answer to each question. The conversations are played only once.",
        ],
        [4] =
        [
            "Part 4. Talks.",
            "In this part, you will hear short talks given by a single speaker. After each talk, you will hear three questions about it. The questions and answer choices are printed in your test book. Choose the best answer to each question. The talks are played only once.",
        ],
    };

    public static List<Line> For(JsonNode g, int part, ExamCue? exam = null)
    {
        var questions = g["questions"]!.AsArray().Select(q => q!).OrderBy(q => q["number"]!.GetValue<int>()).ToList();
        var first = questions[0]["number"]!.GetValue<int>();
        var last = questions[^1]["number"]!.GetValue<int>();
        var lines = new List<Line>();
        // Đề thi thật: 5 giây trả lời sau Part 1–2, 8 giây sau mỗi câu hỏi Part 3–4.
        var answerPause = exam is null ? 2500 : 5000;
        var questionPause = exam is null ? 5000 : 8000;

        if (exam?.FirstOfPart == true && Directions.TryGetValue(part, out var directions))
        {
            foreach (var d in directions) lines.Add(new("N", d, d.Length < 40 ? 900 : 1200));
            lines[^1] = lines[^1] with { PauseMs = 2000 };
        }

        switch (part)
        {
            case 1:
            {
                var reader = (string?)g["voice"] ?? (first % 2 == 1 ? "M" : "W");
                lines.Add(new("N", $"Number {first}. Look at the picture marked number {first} in your test book.", 1000));
                foreach (var key in "ABCD")
                    lines.Add(new(reader, $"{key}. {Option(questions[0], key)}", key == 'D' ? answerPause : 1000));
                break;
            }
            case 2:
            {
                var roles = ((string?)g["voices"] ?? (first % 2 == 1 ? "W,M" : "M,W")).Split(',');
                var question = ((string?)g["transcript"] ?? "").Split('\n')[0].Trim();
                lines.Add(new("N", $"Number {first}.", 500));
                lines.Add(new(roles[0], question, 1100));
                foreach (var key in "ABC")
                    lines.Add(new(roles[1], $"{key}. {Option(questions[0], key)}", key == 'C' ? answerPause : 1000));
                break;
            }
            case 3 or 4:
            {
                var intro = (string?)g["intro"] ?? (part == 3 ? "conversation" : "talk");
                lines.Add(new("N", $"Questions {first} through {last} refer to the following {intro}.", 1000));
                var transcript = ((string?)g["transcript"] ?? "").Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0);
                var narrator = (string?)g["voice"] ?? "W";
                foreach (var raw in transcript)
                {
                    var m = Label.Match(raw);
                    lines.Add(m.Success ? new(m.Groups[1].Value, m.Groups[2].Value, 450) : new(narrator, raw, 450));
                }
                lines[^1] = lines[^1] with { PauseMs = 1300 };
                foreach (var q in questions)
                {
                    var content = (string?)q["content"] ?? "";
                    var graphic = content.StartsWith("Look at the graphic", StringComparison.OrdinalIgnoreCase);
                    lines.Add(new("N", $"Number {q["number"]}. {content}", graphic && exam is null ? 7000 : questionPause));
                }
                break;
            }
            default:
                throw new InvalidOperationException($"Part {part} không có audio.");
        }
        if (exam?.EndOfListening == true)
            lines.Add(new("N", "This is the end of the Listening test. Turn to Part 5 in your test book.", 1500));
        return lines;
    }

    private static string Option(JsonNode q, char key) =>
        (string?)q["options"]?[key.ToString()] ?? throw new InvalidOperationException($"Câu {q["number"]}: thiếu lựa chọn {key}.");
}

/// <summary>Tổng hợp giọng đọc bằng Windows (David, Zira, Mark), ghép PCM, xuất WAV hoặc MP3.</summary>
public sealed class VoiceStudio
{
    private const int SampleRate = 16000; // Windows TTS xuất 16 kHz · 16-bit · mono

    // Người dẫn (đọc số câu, câu hỏi) dùng giọng riêng để tách khỏi người nói trong bài.
    private static readonly Dictionary<string, (string Voice, double Pitch, double Rate)> Cast = new()
    {
        ["N"] = ("Mark", 0.92, 0.95),
        ["W"] = ("Zira", 1.0, 0.95),
        ["W1"] = ("Zira", 1.0, 0.95),
        ["W2"] = ("Zira", 1.22, 1.0),
        ["M"] = ("David", 1.0, 0.95),
        ["M1"] = ("David", 1.0, 0.95),
        ["M2"] = ("Mark", 1.08, 1.0),
    };

    private readonly Dictionary<string, SpeechSynthesizer> _synths = new();

    public async Task<double> RenderAsync(IReadOnlyList<Line> lines, string dest)
    {
        using var pcm = new MemoryStream();
        foreach (var line in lines)
        {
            pcm.Write(await SynthesizeAsync(line.Role, Clean(line.Text)));
            pcm.Write(new byte[SampleRate * 2 * line.PauseMs / 1000]);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
        var wav = WrapWav(pcm.ToArray());
        if (Path.GetExtension(dest).Equals(".wav", StringComparison.OrdinalIgnoreCase))
            await File.WriteAllBytesAsync(dest, wav);
        else
            await EncodeMp3Async(wav, dest);
        return pcm.Length / (SampleRate * 2.0);
    }

    public static async Task<double> DurationAsync(string path)
    {
        var file = await StorageFile.GetFileFromPathAsync(Path.GetFullPath(path));
        return (await file.Properties.GetMusicPropertiesAsync()).Duration.TotalSeconds;
    }

    private async Task<byte[]> SynthesizeAsync(string role, string text)
    {
        if (!Cast.TryGetValue(role, out var cast)) throw new InvalidOperationException($"Vai đọc \"{role}\" không hợp lệ.");
        if (!_synths.TryGetValue(role, out var synth))
        {
            var voice = SpeechSynthesizer.AllVoices.FirstOrDefault(v => v.DisplayName.Contains(cast.Voice))
                        ?? throw new InvalidOperationException($"Máy chưa cài giọng Microsoft {cast.Voice} (en-US).");
            synth = new SpeechSynthesizer { Voice = voice };
            synth.Options.AudioPitch = cast.Pitch;
            synth.Options.SpeakingRate = cast.Rate;
            _synths[role] = synth;
        }

        using var stream = await synth.SynthesizeTextToStreamAsync(text);
        var bytes = new byte[stream.Size];
        using (var reader = new DataReader(stream.GetInputStreamAt(0)))
        {
            await reader.LoadAsync((uint)stream.Size);
            reader.ReadBytes(bytes);
        }
        return ExtractPcm(bytes);
    }

    // Chuẩn hoá ký tự để giọng máy đọc tự nhiên.
    private static string Clean(string text) => text
        .Replace('“', '"').Replace('”', '"').Replace('’', '\'').Replace('‘', '\'')
        .Replace(" – ", ", ").Replace(" — ", ", ").Replace("—", ", ");

    private static byte[] ExtractPcm(byte[] wav)
    {
        var pos = 12;
        while (pos + 8 <= wav.Length)
        {
            var id = System.Text.Encoding.ASCII.GetString(wav, pos, 4);
            var size = BitConverter.ToInt32(wav, pos + 4);
            if (id == "fmt ")
            {
                var channels = BitConverter.ToInt16(wav, pos + 10);
                var rate = BitConverter.ToInt32(wav, pos + 12);
                var bits = BitConverter.ToInt16(wav, pos + 22);
                if (channels != 1 || rate != SampleRate || bits != 16)
                    throw new InvalidOperationException($"Định dạng giọng đọc không mong đợi: {rate} Hz, {channels} kênh, {bits} bit.");
            }
            if (id == "data") return wav.AsSpan(pos + 8, Math.Min(size, wav.Length - pos - 8)).ToArray();
            pos += 8 + size + (size & 1);
        }
        throw new InvalidOperationException("Không đọc được dữ liệu âm thanh từ giọng đọc.");
    }

    private static byte[] WrapWav(byte[] pcm)
    {
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write("RIFF"u8); w.Write(36 + pcm.Length); w.Write("WAVE"u8);
        w.Write("fmt "u8); w.Write(16); w.Write((short)1); w.Write((short)1);
        w.Write(SampleRate); w.Write(SampleRate * 2); w.Write((short)2); w.Write((short)16);
        w.Write("data"u8); w.Write(pcm.Length); w.Write(pcm);
        w.Flush();
        return ms.ToArray();
    }

    // MP3 40 kbps mono: đủ rõ cho giọng nói, nhỏ hơn WAV ~6 lần.
    private static async Task EncodeMp3Async(byte[] wav, string dest)
    {
        var tempWav = Path.Combine(Path.GetTempPath(), $"toeic-{Guid.NewGuid():N}.wav");
        var tempMp3 = Path.ChangeExtension(tempWav, ".mp3");
        await File.WriteAllBytesAsync(tempWav, wav);
        try
        {
            var source = await StorageFile.GetFileFromPathAsync(tempWav);
            var folder = await StorageFolder.GetFolderFromPathAsync(Path.GetDirectoryName(tempMp3)!);
            var target = await folder.CreateFileAsync(Path.GetFileName(tempMp3), CreationCollisionOption.ReplaceExisting);
            var profile = MediaEncodingProfile.CreateMp3(AudioEncodingQuality.Low);
            profile.Audio.ChannelCount = 1;
            profile.Audio.SampleRate = 32000;
            profile.Audio.Bitrate = 40000;
            var prepared = await new MediaTranscoder().PrepareFileTranscodeAsync(source, target, profile);
            if (!prepared.CanTranscode) throw new InvalidOperationException($"Không mã hoá được MP3: {prepared.FailureReason}");
            await prepared.TranscodeAsync();
            File.Copy(tempMp3, dest, overwrite: true);
        }
        finally
        {
            File.Delete(tempWav);
            if (File.Exists(tempMp3)) File.Delete(tempMp3);
        }
    }
}
