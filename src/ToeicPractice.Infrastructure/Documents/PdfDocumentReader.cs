using Microsoft.Extensions.Logging;
using ToeicPractice.Application.Common.Interfaces;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;
using WinPdf = Windows.Data.Pdf;
using Windows.Storage.Streams;

namespace ToeicPractice.Infrastructure.Documents;

/// <summary>
/// Đọc PDF bằng PdfPig (chữ + ảnh nhúng). Trang không có lớp chữ (bản scan) được render bằng
/// Windows.Data.Pdf rồi OCR. Trang không có ảnh cũng được render để làm ảnh dự phòng cho câu mô tả tranh.
/// </summary>
public class PdfDocumentReader(IOcrService ocr, ILogger<PdfDocumentReader> logger) : IPdfDocumentReader
{
    private const int MaxPages = 120;
    private const int RenderWidth = 1400;

    public async Task<PdfContent> ReadAsync(Stream pdf, CancellationToken ct = default)
    {
        using var buffer = new MemoryStream();
        await pdf.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();

        using var doc = PdfDocument.Open(bytes);
        if (doc.NumberOfPages > MaxPages)
            throw new Application.Common.Exceptions.ValidationAppException($"PDF quá dài ({doc.NumberOfPages} trang, tối đa {MaxPages}).");

        var pages = new List<(int Index, List<string> Lines, List<PdfImage> Images)>();
        foreach (var page in doc.GetPages())
        {
            ct.ThrowIfCancellationRequested();
            var text = ContentOrderTextExtractor.GetText(page);
            var lines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
            pages.Add((page.Number, lines, ExtractImages(page)));
        }

        var textChars = pages.Sum(p => p.Lines.Sum(l => l.Length));
        var scanned = textChars < 40 * Math.Max(1, pages.Count);

        // Chỉ render những trang cần: toàn bộ nếu là bản scan, hoặc trang không có ảnh nào.
        var needRender = scanned
            ? pages.Select(p => p.Index).ToHashSet()
            : pages.Where(p => p.Images.Count == 0).Select(p => p.Index).ToHashSet();
        var renders = needRender.Count > 0 ? await RenderPagesAsync(bytes, needRender, ct) : new Dictionary<int, byte[]>();

        var result = new List<PdfPageContent>();
        foreach (var (index, lines, images) in pages)
        {
            var render = renders.GetValueOrDefault(index);
            var pageLines = lines;
            if (scanned && render is not null)
            {
                var text = await ocr.RecognizeAsync(render, ct);
                pageLines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
            }
            result.Add(new PdfPageContent(index, pageLines, images, render));
        }

        string? title = null;
        try { title = doc.Information.Title; } catch { /* metadata lỗi – bỏ qua */ }
        return new PdfContent(title, result, scanned);
    }

    private List<PdfImage> ExtractImages(UglyToad.PdfPig.Content.Page page)
    {
        var list = new List<PdfImage>();
        foreach (var img in page.GetImages())
        {
            try
            {
                byte[]? data = null;
                var ext = ".png";
                if (img.TryGetPng(out var png)) data = png;
                else
                {
                    var raw = img.RawBytes.ToArray();
                    if (raw.Length > 3 && raw[0] == 0xFF && raw[1] == 0xD8) { data = raw; ext = ".jpg"; }
                }
                if (data is null) continue;
                list.Add(new PdfImage(data, ext, img.WidthInSamples, img.HeightInSamples,
                    page.Height - img.BoundingBox.Top, img.BoundingBox.Left));
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Skip unreadable image on page {Page}", page.Number);
            }
        }
        return list;
    }

    private async Task<Dictionary<int, byte[]>> RenderPagesAsync(byte[] bytes, HashSet<int> pageNumbers, CancellationToken ct)
    {
        var renders = new Dictionary<int, byte[]>();
        try
        {
            using var input = new MemoryStream(bytes).AsRandomAccessStream();
            var doc = await WinPdf.PdfDocument.LoadFromStreamAsync(input);
            foreach (var number in pageNumbers.OrderBy(n => n))
            {
                ct.ThrowIfCancellationRequested();
                if (number < 1 || number > doc.PageCount) continue;
                using var page = doc.GetPage((uint)(number - 1));
                using var output = new InMemoryRandomAccessStream();
                await page.RenderToStreamAsync(output, new WinPdf.PdfPageRenderOptions { DestinationWidth = RenderWidth });
                using var reader = new DataReader(output.GetInputStreamAt(0));
                await reader.LoadAsync((uint)output.Size);
                var data = new byte[output.Size];
                reader.ReadBytes(data);
                renders[number] = data;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not render PDF pages");
        }
        return renders;
    }
}
