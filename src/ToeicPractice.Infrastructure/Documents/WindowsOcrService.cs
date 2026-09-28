using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;

namespace ToeicPractice.Infrastructure.Documents;

/// <summary>OCR bằng Windows.Media.Ocr (có sẵn trên Windows 10/11, cần gói ngôn ngữ tiếng Anh).</summary>
public class WindowsOcrService : IOcrService
{
    public async Task<string> RecognizeAsync(byte[] image, CancellationToken ct = default)
    {
        var engine = OcrEngine.TryCreateFromLanguage(new Language("en-US"))
                     ?? OcrEngine.TryCreateFromUserProfileLanguages()
                     ?? throw new ValidationAppException("Máy chủ chưa có gói nhận dạng chữ (OCR) tiếng Anh của Windows.");

        using var stream = new MemoryStream(image).AsRandomAccessStream();
        BitmapDecoder decoder;
        try { decoder = await BitmapDecoder.CreateAsync(stream); }
        catch (Exception) { throw new ValidationAppException("Không đọc được file ảnh (dùng PNG hoặc JPG)."); }

        // Phóng to ảnh nhỏ để OCR chính xác hơn, thu nhỏ ảnh vượt giới hạn của engine.
        var max = OcrEngine.MaxImageDimension;
        double scale = 1;
        var longest = Math.Max(decoder.PixelWidth, decoder.PixelHeight);
        if (longest < 1600) scale = Math.Min(2.5, 1600.0 / longest);
        if (longest * scale > max) scale = (double)max / longest;

        var transform = new BitmapTransform
        {
            ScaledWidth = (uint)Math.Max(1, decoder.PixelWidth * scale),
            ScaledHeight = (uint)Math.Max(1, decoder.PixelHeight * scale),
            InterpolationMode = BitmapInterpolationMode.Fant
        };
        using var bitmap = await decoder.GetSoftwareBitmapAsync(
            BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, transform,
            ExifOrientationMode.RespectExifOrientation, ColorManagementMode.DoNotColorManage);

        ct.ThrowIfCancellationRequested();
        var result = await engine.RecognizeAsync(bitmap);
        return string.Join("\n", result.Lines.Select(l => l.Text));
    }
}
