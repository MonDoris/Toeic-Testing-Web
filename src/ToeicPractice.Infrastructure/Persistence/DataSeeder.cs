using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Features.Grammar;
using ToeicPractice.Application.Features.Tests.Import;
using ToeicPractice.Application.Features.Vocabularies;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;
using ToeicPractice.Infrastructure.Storage;

namespace ToeicPractice.Infrastructure.Persistence;

/// <summary>
/// Khởi tạo CSDL và nạp dữ liệu ban đầu: tài khoản, từ vựng, ngữ pháp và đề mẫu.
/// Dữ liệu nằm trong thư mục Seed (được copy ra output khi build).
/// Từ vựng và đề mẫu được bổ sung cả vào CSDL đã có dữ liệu; những gì đã nạp được ghi
/// trong App_Data/seed-state.json để đề mà admin đã xoá không bị nạp lại.
/// </summary>
public class DataSeeder(
    AppDbContext db,
    IPasswordHasher hasher,
    IVocabularyService vocabularies,
    ITestImportService importer,
    IConfiguration config,
    IOptions<StorageOptions> storage,
    ILogger<DataSeeder> logger)
{
    private static readonly string SeedDir = Path.Combine(AppContext.BaseDirectory, "Seed");

    // Các gói đề có từ phiên bản đầu – đã được nạp khi CSDL còn trống, trước khi có seed-state.json.
    private static readonly string[] LegacySamples = ["listening-sample.zip", "reading-sample.zip", "writing-sample.zip"];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        await db.Database.EnsureCreatedAsync(ct);
        await UpgradeSchemaAsync(ct);
        var state = await SeedState.LoadAsync(StatePath(), ct);
        await SeedUsersAsync(ct);
        await SeedVocabularyAsync(state, ct);
        await SeedGrammarAsync(ct);
        await SeedSampleTestsAsync(state, ct);
        await state.SaveAsync(ct);
    }

    // Cạnh thư mục upload: App_Data/seed-state.json.
    private string StatePath() =>
        Path.Combine(Path.GetDirectoryName(Path.GetFullPath(storage.Value.RootPath))!, "seed-state.json");

    /// <summary>
    /// EnsureCreated không sửa CSDL đã tồn tại → bổ sung các cột/bảng mới bằng lệnh idempotent (SQL Server).
    /// </summary>
    private async Task UpgradeSchemaAsync(CancellationToken ct)
    {
        if (db.Database.IsSqlite())
        {
            // Điểm từng phần của đề Listening & Reading.
            var columns = await db.Database
                .SqlQuery<string>($"SELECT name AS \"Value\" FROM pragma_table_info('Attempts')")
                .ToListAsync(ct);
            if (!columns.Contains("ListeningScore"))
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Attempts ADD COLUMN ListeningScore INTEGER NULL", ct);
            if (!columns.Contains("ReadingScore"))
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Attempts ADD COLUMN ReadingScore INTEGER NULL", ct);
            return;
        }
        if (!db.Database.IsSqlServer()) return;
        await db.Database.ExecuteSqlRawAsync("""
            IF COL_LENGTH('dbo.Attempts', 'ListeningScore') IS NULL
                ALTER TABLE dbo.Attempts ADD ListeningScore int NULL;
            IF COL_LENGTH('dbo.Attempts', 'ReadingScore') IS NULL
                ALTER TABLE dbo.Attempts ADD ReadingScore int NULL;
            """, ct);
        await db.Database.ExecuteSqlRawAsync("""
            IF COL_LENGTH('dbo.Tests', 'SourcePdfUrl') IS NULL
                ALTER TABLE dbo.Tests ADD SourcePdfUrl nvarchar(500) NULL;
            IF COL_LENGTH('dbo.Tests', 'AnswerKeyUrls') IS NULL
                ALTER TABLE dbo.Tests ADD AnswerKeyUrls nvarchar(max) NULL;
            IF OBJECT_ID('dbo.TestAudioTracks', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.TestAudioTracks (
                    Id uniqueidentifier NOT NULL CONSTRAINT PK_TestAudioTracks PRIMARY KEY,
                    TestId uniqueidentifier NOT NULL,
                    Part int NULL,
                    Url nvarchar(500) NOT NULL,
                    FileName nvarchar(260) NOT NULL,
                    CreatedAt datetime2 NOT NULL,
                    UpdatedAt datetime2 NULL,
                    CONSTRAINT FK_TestAudioTracks_Tests_TestId FOREIGN KEY (TestId) REFERENCES dbo.Tests (Id) ON DELETE CASCADE
                );
                CREATE INDEX IX_TestAudioTracks_TestId ON dbo.TestAudioTracks (TestId);
            END
            """, ct);
    }

    private async Task SeedUsersAsync(CancellationToken ct)
    {
        var adminEmail = (config["Seed:AdminEmail"] ?? "admin@toeic.local").ToLowerInvariant();
        if (!await db.Users.AnyAsync(u => u.Role == UserRole.Admin, ct))
        {
            db.Users.Add(new User
            {
                FullName = "Quản trị viên",
                Email = adminEmail,
                PasswordHash = hasher.Hash(config["Seed:AdminPassword"] ?? "Admin@123"),
                Role = UserRole.Admin
            });
            logger.LogInformation("Seeded admin account {Email}", adminEmail);
        }

        var demoEmail = config["Seed:DemoStudentEmail"];
        if (!string.IsNullOrWhiteSpace(demoEmail) && !await db.Users.AnyAsync(u => u.Email == demoEmail, ct))
        {
            db.Users.Add(new User
            {
                FullName = "Học viên Demo",
                Email = demoEmail.ToLowerInvariant(),
                PasswordHash = hasher.Hash(config["Seed:DemoStudentPassword"] ?? "Hocvien@123"),
                Role = UserRole.Student,
                TargetScore = 750
            });
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Nạp vocabulary.json mỗi khi file thay đổi. overwrite = false: chỉ thêm từ chưa có,
    /// không ghi đè những từ admin đã chỉnh sửa.
    /// </summary>
    private async Task SeedVocabularyAsync(SeedState state, CancellationToken ct)
    {
        var file = Path.Combine(SeedDir, "vocabulary.json");
        if (!File.Exists(file)) return;

        var bytes = await File.ReadAllBytesAsync(file, ct);
        var hash = Convert.ToHexString(SHA256.HashData(bytes));
        if (hash == state.VocabularyHash && await db.Vocabularies.AnyAsync(ct)) return;

        var items = JsonSerializer.Deserialize<List<VocabularyRequest>>(bytes,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
        var result = await vocabularies.BulkImportAsync(items, overwrite: false, ct);
        state.VocabularyHash = hash;
        logger.LogInformation("Seeded {Count} new vocabulary items", result.Created);
    }

    private async Task SeedGrammarAsync(CancellationToken ct)
    {
        var dir = Path.Combine(SeedDir, "grammar");
        if (await db.GrammarTopics.AnyAsync(ct) || !Directory.Exists(dir)) return;

        foreach (var file in Directory.GetFiles(dir, "*.md").OrderBy(f => f))
        {
            var (meta, body) = ParseFrontMatter(await File.ReadAllTextAsync(file, ct));
            var title = meta.GetValueOrDefault("title") ?? Path.GetFileNameWithoutExtension(file);
            db.GrammarTopics.Add(new GrammarTopic
            {
                Title = title,
                Slug = meta.GetValueOrDefault("slug") ?? GrammarService.Slugify(title),
                Category = meta.GetValueOrDefault("category") ?? "Khác",
                Summary = meta.GetValueOrDefault("summary") ?? "",
                Formula = meta.GetValueOrDefault("formula"),
                Level = int.TryParse(meta.GetValueOrDefault("level"), out var lv) ? lv : 450,
                OrderIndex = int.TryParse(meta.GetValueOrDefault("order"), out var o) ? o : 0,
                Source = meta.GetValueOrDefault("source"),
                Content = body.Trim()
            });
        }
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded grammar topics");
    }

    /// <summary>
    /// Nạp các gói đề trong Seed/samples chưa từng được nạp. Bỏ qua gói có tiêu đề trùng đề đã có.
    /// </summary>
    private async Task SeedSampleTestsAsync(SeedState state, CancellationToken ct)
    {
        var dir = Path.Combine(SeedDir, "samples");
        if (!Directory.Exists(dir)) return;

        if (state.Samples is null)
        {
            state.Samples = [];
            if (await db.Tests.AnyAsync(ct)) state.Samples.AddRange(LegacySamples);
        }
        var seeded = state.Samples.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var titles = (await db.Tests.Select(t => t.Title).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        // Thư viện hiển thị đề mới nhất trước → nhập theo tên giảm dần để "…-01" đứng đầu danh sách.
        foreach (var zip in Directory.GetFiles(dir, "*.zip").OrderByDescending(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            var name = Path.GetFileName(zip);
            if (seeded.Contains(name)) continue;
            try
            {
                if (ReadTitle(zip) is { } title && titles.Contains(title))
                {
                    state.Samples.Add(name);
                    continue;
                }
                await using var stream = File.OpenRead(zip);
                var result = await importer.ImportAsync(stream, name, dryRun: false, ct);
                state.Samples.Add(name);
                logger.LogInformation("Seeded sample test {Title} ({Count} questions)", result.Title, result.QuestionCount);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Could not import sample test {File}", zip);
            }
        }
    }

    private static string? ReadTitle(string zipPath)
    {
        using var zip = ZipFile.OpenRead(zipPath);
        var entry = zip.Entries.FirstOrDefault(e => e.FullName.Replace('\\', '/').Split('/')[^1]
            .Equals("test.json", StringComparison.OrdinalIgnoreCase));
        if (entry is null) return null;
        using var stream = entry.Open();
        using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        return doc.RootElement.TryGetProperty("title", out var t) ? t.GetString()?.Trim() : null;
    }

    /// <summary>Ghi nhận dữ liệu seed đã nạp (App_Data/seed-state.json).</summary>
    private sealed class SeedState
    {
        private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
        private string _path = "";

        public string? VocabularyHash { get; set; }
        /// <summary>Tên các gói .zip đã nạp; null = chưa có file ghi nhận (CSDL cũ hoặc mới tạo).</summary>
        public List<string>? Samples { get; set; }

        public static async Task<SeedState> LoadAsync(string path, CancellationToken ct)
        {
            var state = File.Exists(path)
                ? JsonSerializer.Deserialize<SeedState>(await File.ReadAllTextAsync(path, ct)) ?? new SeedState()
                : new SeedState();
            state._path = path;
            return state;
        }

        public async Task SaveAsync(CancellationToken ct)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            await File.WriteAllTextAsync(_path, JsonSerializer.Serialize(this, Json), ct);
        }
    }

    private static (Dictionary<string, string> Meta, string Body) ParseFrontMatter(string text)
    {
        var meta = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        text = text.Replace("\r\n", "\n");
        if (!text.StartsWith("---\n")) return (meta, text);
        var end = text.IndexOf("\n---", 4, StringComparison.Ordinal);
        if (end < 0) return (meta, text);
        foreach (var line in text[4..end].Split('\n'))
        {
            var idx = line.IndexOf(':');
            if (idx > 0) meta[line[..idx].Trim()] = line[(idx + 1)..].Trim().Trim('"');
        }
        return (meta, text[(end + 4)..]);
    }
}
