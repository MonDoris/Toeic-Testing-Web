using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Common.Models;
using ToeicPractice.Domain.Entities;

namespace ToeicPractice.Application.Features.Vocabularies;

public record VocabularyDto(
    Guid Id, string Word, string? Phonetic, string? PartOfSpeech, string MeaningVi,
    string? DefinitionEn, string? Example, string? ExampleVi, string? Synonyms,
    string Topic, int Level, string? AudioUrl, string? Source, bool IsSaved, bool IsMastered);

public record VocabularyRequest(
    string Word, string? Phonetic, string? PartOfSpeech, string MeaningVi,
    string? DefinitionEn, string? Example, string? ExampleVi, string? Synonyms,
    string Topic, int Level, string? AudioUrl, string? Source);

public record TopicCountDto(string Topic, int Count);

public record BulkImportResultDto(int Created, int Updated, int Skipped, IReadOnlyList<string> Errors);

public record EnrichResultDto(int Checked, int Enriched, int NotFound, int Remaining);

public interface IVocabularyService
{
    Task<PagedResult<VocabularyDto>> SearchAsync(string? q, string? topic, int? level, bool savedOnly, Guid? userId, int page, int pageSize, CancellationToken ct);
    Task<IReadOnlyList<TopicCountDto>> GetTopicsAsync(CancellationToken ct);
    Task<VocabularyDto> GetAsync(Guid id, Guid? userId, CancellationToken ct);
    Task<VocabularyDto> CreateAsync(VocabularyRequest request, CancellationToken ct);
    Task<VocabularyDto> UpdateAsync(Guid id, VocabularyRequest request, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
    Task<BulkImportResultDto> BulkImportAsync(IReadOnlyList<VocabularyRequest> items, bool overwrite, CancellationToken ct);
    Task<DictionaryEntry?> LookupOnlineAsync(string word, CancellationToken ct);
    Task SetSavedAsync(Guid userId, Guid vocabularyId, bool saved, bool? mastered, CancellationToken ct);
    Task<EnrichResultDto> EnrichMissingAsync(int limit, CancellationToken ct);
}

public class VocabularyService(IApplicationDbContext db, IDictionaryLookupService dictionary) : IVocabularyService
{
    public async Task<PagedResult<VocabularyDto>> SearchAsync(string? q, string? topic, int? level, bool savedOnly, Guid? userId,
        int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = db.Vocabularies.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(v => v.Word.ToLower().Contains(term) || v.MeaningVi.ToLower().Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(topic)) query = query.Where(v => v.Topic == topic);
        if (level is not null) query = query.Where(v => v.Level == level);

        var savedIds = userId is null
            ? new Dictionary<Guid, bool>()
            : await db.SavedVocabularies.Where(s => s.UserId == userId)
                .ToDictionaryAsync(s => s.VocabularyId, s => s.IsMastered, ct);
        if (savedOnly)
        {
            var ids = savedIds.Keys.ToList();
            query = query.Where(v => ids.Contains(v.Id));
        }

        var total = await query.CountAsync(ct);
        var ordered = string.IsNullOrWhiteSpace(q)
            ? query.OrderBy(v => v.Topic).ThenBy(v => v.Word)
            : query.OrderBy(v => v.Word.ToLower() == q.Trim().ToLower() ? 0 : v.Word.ToLower().StartsWith(q.Trim().ToLower()) ? 1 : 2)
                   .ThenBy(v => v.Word);
        var items = await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        return new PagedResult<VocabularyDto>(
            items.Select(v => ToDto(v, savedIds.ContainsKey(v.Id), savedIds.GetValueOrDefault(v.Id))).ToList(),
            total, page, pageSize);
    }

    public async Task<IReadOnlyList<TopicCountDto>> GetTopicsAsync(CancellationToken ct) =>
        await db.Vocabularies.AsNoTracking()
            .GroupBy(v => v.Topic)
            .OrderBy(g => g.Key)
            .Select(g => new TopicCountDto(g.Key, g.Count()))
            .ToListAsync(ct);

    public async Task<VocabularyDto> GetAsync(Guid id, Guid? userId, CancellationToken ct)
    {
        var v = await db.Vocabularies.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
                ?? throw new NotFoundException("từ vựng", id);
        var saved = userId is null ? null
            : await db.SavedVocabularies.AsNoTracking().FirstOrDefaultAsync(s => s.UserId == userId && s.VocabularyId == id, ct);
        return ToDto(v, saved != null, saved?.IsMastered ?? false);
    }

    public async Task<VocabularyDto> CreateAsync(VocabularyRequest request, CancellationToken ct)
    {
        Validate(request);
        var word = request.Word.Trim();
        if (await db.Vocabularies.AnyAsync(v => v.Word.ToLower() == word.ToLower() && v.PartOfSpeech == request.PartOfSpeech, ct))
            throw new ConflictException($"Từ \"{word}\" ({request.PartOfSpeech}) đã có trong từ điển.");
        var entity = new Vocabulary();
        Apply(entity, request);
        db.Vocabularies.Add(entity);
        await db.SaveChangesAsync(ct);
        return ToDto(entity, false, false);
    }

    public async Task<VocabularyDto> UpdateAsync(Guid id, VocabularyRequest request, CancellationToken ct)
    {
        Validate(request);
        var entity = await db.Vocabularies.FindAsync([id], ct) ?? throw new NotFoundException("từ vựng", id);
        Apply(entity, request);
        entity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(entity, false, false);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var entity = await db.Vocabularies.FindAsync([id], ct) ?? throw new NotFoundException("từ vựng", id);
        db.SavedVocabularies.RemoveRange(db.SavedVocabularies.Where(s => s.VocabularyId == id));
        db.Vocabularies.Remove(entity);
        await db.SaveChangesAsync(ct);
    }

    public async Task<BulkImportResultDto> BulkImportAsync(IReadOnlyList<VocabularyRequest> items, bool overwrite, CancellationToken ct)
    {
        if (items.Count == 0) throw new ValidationAppException("Danh sách từ vựng trống.");
        if (items.Count > 5000) throw new ValidationAppException("Mỗi lần chỉ nhập tối đa 5000 từ.");

        var existing = await db.Vocabularies.ToListAsync(ct);
        var index = existing.GroupBy(v => v.Word.ToLower()).ToDictionary(g => g.Key, g => g.First());
        int created = 0, updated = 0, skipped = 0;
        var errors = new List<string>();

        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            try { Validate(item); }
            catch (ValidationAppException ex)
            {
                errors.Add($"Dòng {i + 1} ({item.Word}): {string.Join(" ", ex.Errors)}");
                skipped++;
                continue;
            }
            var key = item.Word.Trim().ToLower();
            if (index.TryGetValue(key, out var found))
            {
                if (!overwrite) { skipped++; continue; }
                Apply(found, item);
                found.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
            else
            {
                var entity = new Vocabulary();
                Apply(entity, item);
                db.Vocabularies.Add(entity);
                index[key] = entity;
                created++;
            }
        }
        await db.SaveChangesAsync(ct);
        return new BulkImportResultDto(created, updated, skipped, errors.Take(50).ToList());
    }

    public async Task<DictionaryEntry?> LookupOnlineAsync(string word, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(word)) throw new ValidationAppException("Nhập từ cần tra.");
        return await dictionary.LookupAsync(word.Trim(), ct);
    }

    public async Task SetSavedAsync(Guid userId, Guid vocabularyId, bool saved, bool? mastered, CancellationToken ct)
    {
        if (!await db.Vocabularies.AnyAsync(v => v.Id == vocabularyId, ct))
            throw new NotFoundException("từ vựng", vocabularyId);
        var entry = await db.SavedVocabularies.FirstOrDefaultAsync(s => s.UserId == userId && s.VocabularyId == vocabularyId, ct);
        if (!saved)
        {
            if (entry != null) db.SavedVocabularies.Remove(entry);
        }
        else
        {
            if (entry == null)
            {
                entry = new SavedVocabulary { UserId = userId, VocabularyId = vocabularyId };
                db.SavedVocabularies.Add(entry);
            }
            if (mastered is not null) entry.IsMastered = mastered.Value;
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Bổ sung phiên âm / audio / định nghĩa / đồng nghĩa còn thiếu từ nguồn từ điển trực tuyến.</summary>
    public async Task<EnrichResultDto> EnrichMissingAsync(int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, 100);
        var missing = db.Vocabularies.Where(v => v.Phonetic == null || v.AudioUrl == null || v.DefinitionEn == null);
        var batch = await missing.OrderBy(v => v.Word).Take(limit).ToListAsync(ct);
        int enriched = 0, notFound = 0;
        foreach (var v in batch)
        {
            // Cụm từ nhiều chữ thường không có trong từ điển – tra từ chính.
            var entry = await dictionary.LookupAsync(v.Word, ct);
            if (entry is null) { notFound++; v.AudioUrl ??= ""; v.Phonetic ??= ""; v.DefinitionEn ??= ""; continue; }
            if (string.IsNullOrEmpty(v.Phonetic)) v.Phonetic = entry.Phonetic ?? "";
            if (string.IsNullOrEmpty(v.AudioUrl)) v.AudioUrl = entry.AudioUrl ?? "";
            if (string.IsNullOrEmpty(v.DefinitionEn)) v.DefinitionEn = entry.DefinitionEn ?? "";
            if (string.IsNullOrEmpty(v.Example) && entry.Example != null) v.Example = entry.Example;
            if (string.IsNullOrEmpty(v.Synonyms) && entry.Synonyms.Count > 0) v.Synonyms = string.Join(", ", entry.Synonyms);
            v.Source = string.IsNullOrEmpty(v.Source) ? entry.Source : v.Source.Contains("dictionaryapi") ? v.Source : $"{v.Source}; {entry.Source}";
            v.UpdatedAt = DateTime.UtcNow;
            enriched++;
        }
        await db.SaveChangesAsync(ct);
        var remaining = await missing.CountAsync(ct);
        return new EnrichResultDto(batch.Count, enriched, notFound, remaining);
    }

    private static void Validate(VocabularyRequest r)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(r.Word)) errors.Add("Từ vựng không được để trống.");
        else if (r.Word.Length > 100) errors.Add("Từ vựng tối đa 100 ký tự.");
        if (string.IsNullOrWhiteSpace(r.MeaningVi)) errors.Add("Cần nhập nghĩa tiếng Việt.");
        if (string.IsNullOrWhiteSpace(r.Topic)) errors.Add("Cần chọn chủ đề.");
        if (r.Level is not (450 or 650 or 850)) errors.Add("Level phải là 450, 650 hoặc 850.");
        if (errors.Count > 0) throw new ValidationAppException(errors);
    }

    private static void Apply(Vocabulary v, VocabularyRequest r)
    {
        v.Word = r.Word.Trim();
        v.Phonetic = r.Phonetic?.Trim();
        v.PartOfSpeech = r.PartOfSpeech?.Trim().ToLowerInvariant();
        v.MeaningVi = r.MeaningVi.Trim();
        v.DefinitionEn = r.DefinitionEn?.Trim();
        v.Example = r.Example?.Trim();
        v.ExampleVi = r.ExampleVi?.Trim();
        v.Synonyms = r.Synonyms?.Trim();
        v.Topic = r.Topic.Trim();
        v.Level = r.Level;
        v.AudioUrl = r.AudioUrl?.Trim();
        v.Source = r.Source?.Trim();
    }

    private static VocabularyDto ToDto(Vocabulary v, bool saved, bool mastered) => new(
        v.Id, v.Word, v.Phonetic, v.PartOfSpeech, v.MeaningVi, v.DefinitionEn, v.Example, v.ExampleVi,
        v.Synonyms, v.Topic, v.Level, v.AudioUrl, v.Source, saved, mastered);
}
