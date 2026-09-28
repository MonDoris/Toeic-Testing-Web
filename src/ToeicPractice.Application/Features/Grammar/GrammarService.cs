using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Domain.Entities;

namespace ToeicPractice.Application.Features.Grammar;

public record GrammarListItemDto(Guid Id, string Title, string Slug, string Category, string Summary, string? Formula, int Level, int OrderIndex);

public record GrammarDetailDto(
    Guid Id, string Title, string Slug, string Category, string Summary, string? Formula,
    string Content, int Level, int OrderIndex, string? Source, DateTime UpdatedAt,
    GrammarListItemDto? Previous, GrammarListItemDto? Next);

public record GrammarRequest(string Title, string? Slug, string Category, string Summary, string? Formula,
    string Content, int Level, int OrderIndex, string? Source);

public interface IGrammarService
{
    Task<IReadOnlyList<GrammarListItemDto>> ListAsync(string? q, string? category, CancellationToken ct);
    Task<GrammarDetailDto> GetAsync(string slugOrId, CancellationToken ct);
    Task<GrammarDetailDto> CreateAsync(GrammarRequest request, CancellationToken ct);
    Task<GrammarDetailDto> UpdateAsync(Guid id, GrammarRequest request, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
}

public partial class GrammarService(IApplicationDbContext db) : IGrammarService
{
    public async Task<IReadOnlyList<GrammarListItemDto>> ListAsync(string? q, string? category, CancellationToken ct)
    {
        var query = db.GrammarTopics.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(g => g.Title.ToLower().Contains(term) || g.Summary.ToLower().Contains(term)
                                     || g.Content.ToLower().Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(category)) query = query.Where(g => g.Category == category);
        var items = await query.OrderBy(g => g.OrderIndex).ThenBy(g => g.Title).ToListAsync(ct);
        return items.Select(ToListItem).ToList();
    }

    public async Task<GrammarDetailDto> GetAsync(string slugOrId, CancellationToken ct)
    {
        var all = await db.GrammarTopics.AsNoTracking().OrderBy(g => g.OrderIndex).ThenBy(g => g.Title).ToListAsync(ct);
        var idx = all.FindIndex(g => g.Slug == slugOrId || g.Id.ToString() == slugOrId);
        if (idx < 0) throw new NotFoundException("chủ điểm ngữ pháp", slugOrId);
        return ToDetail(all[idx], idx > 0 ? all[idx - 1] : null, idx < all.Count - 1 ? all[idx + 1] : null);
    }

    public async Task<GrammarDetailDto> CreateAsync(GrammarRequest request, CancellationToken ct)
    {
        Validate(request);
        var entity = new GrammarTopic();
        await ApplyAsync(entity, request, ct);
        db.GrammarTopics.Add(entity);
        await db.SaveChangesAsync(ct);
        return await GetAsync(entity.Slug, ct);
    }

    public async Task<GrammarDetailDto> UpdateAsync(Guid id, GrammarRequest request, CancellationToken ct)
    {
        Validate(request);
        var entity = await db.GrammarTopics.FindAsync([id], ct) ?? throw new NotFoundException("chủ điểm ngữ pháp", id);
        await ApplyAsync(entity, request, ct);
        entity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(entity.Slug, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var entity = await db.GrammarTopics.FindAsync([id], ct) ?? throw new NotFoundException("chủ điểm ngữ pháp", id);
        db.GrammarTopics.Remove(entity);
        await db.SaveChangesAsync(ct);
    }

    private async Task ApplyAsync(GrammarTopic g, GrammarRequest r, CancellationToken ct)
    {
        var slug = Slugify(string.IsNullOrWhiteSpace(r.Slug) ? r.Title : r.Slug);
        var candidate = slug;
        var i = 2;
        while (await db.GrammarTopics.AnyAsync(x => x.Slug == candidate && x.Id != g.Id, ct))
            candidate = $"{slug}-{i++}";

        g.Title = r.Title.Trim();
        g.Slug = candidate;
        g.Category = r.Category.Trim();
        g.Summary = r.Summary.Trim();
        g.Formula = r.Formula?.Trim();
        g.Content = r.Content;
        g.Level = r.Level;
        g.OrderIndex = r.OrderIndex;
        g.Source = r.Source?.Trim();
    }

    private static void Validate(GrammarRequest r)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(r.Title)) errors.Add("Tiêu đề không được để trống.");
        if (string.IsNullOrWhiteSpace(r.Category)) errors.Add("Cần chọn nhóm ngữ pháp.");
        if (string.IsNullOrWhiteSpace(r.Summary)) errors.Add("Cần nhập tóm tắt.");
        if (string.IsNullOrWhiteSpace(r.Content)) errors.Add("Nội dung bài học không được để trống.");
        if (errors.Count > 0) throw new ValidationAppException(errors);
    }

    public static string Slugify(string text)
    {
        var normalized = text.Trim().ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        var slug = NonSlugChars().Replace(sb.ToString(), "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? Guid.NewGuid().ToString("N")[..8] : slug;
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugChars();

    private static GrammarListItemDto ToListItem(GrammarTopic g) =>
        new(g.Id, g.Title, g.Slug, g.Category, g.Summary, g.Formula, g.Level, g.OrderIndex);

    private static GrammarDetailDto ToDetail(GrammarTopic g, GrammarTopic? prev, GrammarTopic? next) =>
        new(g.Id, g.Title, g.Slug, g.Category, g.Summary, g.Formula, g.Content, g.Level, g.OrderIndex, g.Source,
            g.UpdatedAt ?? g.CreatedAt, prev is null ? null : ToListItem(prev), next is null ? null : ToListItem(next));
}
