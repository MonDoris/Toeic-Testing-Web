using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Scoring;

public static class ScoreCalculator
{
    // Bảng quy đổi ước tính (số câu đúng / 100 → điểm), nội suy tuyến tính giữa các mốc.
    private static readonly (int Raw, int Scaled)[] ListeningTable =
    [
        (0, 5), (5, 5), (10, 20), (15, 40), (20, 65), (25, 90), (30, 115), (35, 140),
        (40, 170), (45, 200), (50, 230), (55, 260), (60, 290), (65, 315), (70, 350),
        (75, 380), (80, 410), (85, 440), (90, 475), (95, 495), (100, 495)
    ];

    // Reading khó đạt điểm tối đa hơn Listening: cùng số câu đúng thường cho điểm thấp hơn.
    private static readonly (int Raw, int Scaled)[] ReadingTable =
    [
        (0, 5), (5, 5), (10, 15), (15, 30), (20, 50), (25, 70), (30, 95), (35, 120),
        (40, 145), (45, 175), (50, 205), (55, 235), (60, 265), (65, 295), (70, 325),
        (75, 355), (80, 385), (85, 415), (90, 445), (95, 475), (100, 495)
    ];

    /// <summary>Quy đổi điểm trắc nghiệm (5–495). Đề ngắn hơn 100 câu được chuẩn hoá theo tỉ lệ.</summary>
    public static int ChoiceScaled(Skill skill, int correct, int total) =>
        Interpolate(skill == Skill.Reading ? ReadingTable : ListeningTable, correct, total);

    public static int ListeningScaled(int correct, int total) => Interpolate(ListeningTable, correct, total);

    private static int Interpolate((int Raw, int Scaled)[] table, int correct, int total)
    {
        if (total <= 0) return 5;
        var raw = correct * 100.0 / total;
        for (var i = 1; i < table.Length; i++)
        {
            var (r1, s1) = table[i];
            if (raw > r1) continue;
            var (r0, s0) = table[i - 1];
            var value = s0 + (s1 - s0) * (raw - r0) / (r1 - r0);
            return RoundTo(value, 5, 5, 495);
        }
        return 495;
    }

    /// <summary>Quy đổi điểm Writing (0–200) từ tổng điểm thô / tổng điểm tối đa.</summary>
    public static int WritingScaled(double raw, double max) =>
        max <= 0 ? 0 : RoundTo(raw / max * 200, 10, 0, 200);

    private static int RoundTo(double value, int step, int min, int max)
    {
        var rounded = (int)(Math.Round(value / step, MidpointRounding.AwayFromZero) * step);
        return Math.Clamp(rounded, min, max);
    }
}
