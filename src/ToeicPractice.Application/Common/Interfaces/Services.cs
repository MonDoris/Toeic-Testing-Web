using ToeicPractice.Domain.Entities;

namespace ToeicPractice.Application.Common.Interfaces;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

public interface IJwtTokenGenerator
{
    (string Token, DateTime ExpiresAt) Generate(User user);
}

public interface ICurrentUserService
{
    Guid? UserId { get; }
    bool IsAdmin { get; }
}

/// <summary>Lưu file media (audio, ảnh) và trả về URL public.</summary>
public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, string fileName, string folder, CancellationToken ct = default);
    Task DeleteAsync(string url, CancellationToken ct = default);
}

/// <summary>Tra cứu thông tin từ vựng từ nguồn từ điển trực tuyến.</summary>
public interface IDictionaryLookupService
{
    Task<DictionaryEntry?> LookupAsync(string word, CancellationToken ct = default);
}

/// <summary>Đọc nội dung PDF: chữ theo từng trang và ảnh nhúng (tự OCR nếu là bản scan).</summary>
public interface IPdfDocumentReader
{
    Task<PdfContent> ReadAsync(Stream pdf, CancellationToken ct = default);
}

/// <summary>Nhận dạng chữ (OCR) từ ảnh.</summary>
public interface IOcrService
{
    Task<string> RecognizeAsync(byte[] image, CancellationToken ct = default);
}

public record PdfContent(string? Title, IReadOnlyList<PdfPageContent> Pages, bool UsedOcr);

public record PdfPageContent(int Index, IReadOnlyList<string> Lines, IReadOnlyList<PdfImage> Images, byte[]? PageRender);

/// <summary>Ảnh trong trang. Top: toạ độ tính từ mép trên (0 = đầu trang) để sắp xếp theo thứ tự đọc.</summary>
public record PdfImage(byte[] Bytes, string Extension, int Width, int Height, double Top, double Left);

public record DictionaryEntry(
    string Word,
    string? Phonetic,
    string? AudioUrl,
    string? PartOfSpeech,
    string? DefinitionEn,
    string? Example,
    IReadOnlyList<string> Synonyms,
    string Source);
