using Microsoft.Extensions.Options;
using ToeicPractice.Application.Common.Interfaces;

namespace ToeicPractice.Infrastructure.Storage;

public class StorageOptions
{
    public const string Section = "Storage";
    /// <summary>Thư mục vật lý lưu file upload.</summary>
    public string RootPath { get; set; } = "App_Data/uploads";
    /// <summary>Tiền tố URL public, VD: /uploads.</summary>
    public string RequestPath { get; set; } = "/uploads";
}

public class LocalFileStorage(IOptions<StorageOptions> options) : IFileStorage
{
    private readonly StorageOptions _opt = options.Value;

    public async Task<string> SaveAsync(Stream content, string fileName, string folder, CancellationToken ct = default)
    {
        var safeFolder = new string(folder.Where(char.IsLetterOrDigit).ToArray());
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var name = $"{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}{ext}";
        var dir = Path.Combine(_opt.RootPath, safeFolder);
        Directory.CreateDirectory(dir);

        await using (var fs = File.Create(Path.Combine(dir, name)))
            await content.CopyToAsync(fs, ct);

        return $"{_opt.RequestPath.TrimEnd('/')}/{safeFolder}/{name}";
    }

    public Task DeleteAsync(string url, CancellationToken ct = default)
    {
        var prefix = _opt.RequestPath.TrimEnd('/') + "/";
        if (!url.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return Task.CompletedTask; // URL ngoài
        var relative = url[prefix.Length..].Replace('/', Path.DirectorySeparatorChar);
        var root = Path.GetFullPath(_opt.RootPath);
        var full = Path.GetFullPath(Path.Combine(root, relative));
        if (full.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(full))
            File.Delete(full);
        return Task.CompletedTask;
    }
}
