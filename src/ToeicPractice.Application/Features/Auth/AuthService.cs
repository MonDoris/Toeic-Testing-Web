using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Auth;

public record RegisterRequest(string FullName, string Email, string Password, int? TargetScore);
public record LoginRequest(string Email, string Password);
public record UserDto(Guid Id, string FullName, string Email, string Role, int? TargetScore, DateTime CreatedAt);
public record AuthResponse(string Token, DateTime ExpiresAt, UserDto User);
public record UpdateProfileRequest(string FullName, int? TargetScore);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct);
    Task<UserDto> GetProfileAsync(Guid userId, CancellationToken ct);
    Task<UserDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct);
    Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct);
}

public class AuthService(IApplicationDbContext db, IPasswordHasher hasher, IJwtTokenGenerator jwt) : IAuthService
{
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var errors = new List<string>();
        var email = request.Email?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrWhiteSpace(request.FullName) || request.FullName.Trim().Length < 2)
            errors.Add("Họ tên phải có ít nhất 2 ký tự.");
        if (!MailAddress.TryCreate(email, out _))
            errors.Add("Email không hợp lệ.");
        errors.AddRange(ValidatePassword(request.Password));
        if (request.TargetScore is < 10 or > 990)
            errors.Add("Điểm mục tiêu phải nằm trong khoảng 10–990.");
        if (errors.Count > 0) throw new ValidationAppException(errors);

        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            throw new ConflictException("Email này đã được đăng ký.");

        var user = new User
        {
            FullName = request.FullName.Trim(),
            Email = email,
            PasswordHash = hasher.Hash(request.Password),
            Role = UserRole.Student,
            TargetScore = request.TargetScore
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return BuildResponse(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim().ToLowerInvariant() ?? "";
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null || !hasher.Verify(request.Password ?? "", user.PasswordHash))
            throw new UnauthorizedAppException("Email hoặc mật khẩu không đúng.");
        if (!user.IsActive)
            throw new ForbiddenAppException("Tài khoản đã bị khóa. Liên hệ quản trị viên.");
        return BuildResponse(user);
    }

    public async Task<UserDto> GetProfileAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct) ?? throw new NotFoundException("người dùng", userId);
        return ToDto(user);
    }

    public async Task<UserDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct) ?? throw new NotFoundException("người dùng", userId);
        if (string.IsNullOrWhiteSpace(request.FullName) || request.FullName.Trim().Length < 2)
            throw new ValidationAppException("Họ tên phải có ít nhất 2 ký tự.");
        user.FullName = request.FullName.Trim();
        user.TargetScore = request.TargetScore;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct) ?? throw new NotFoundException("người dùng", userId);
        if (!hasher.Verify(request.CurrentPassword, user.PasswordHash))
            throw new ValidationAppException("Mật khẩu hiện tại không đúng.");
        var errors = ValidatePassword(request.NewPassword).ToList();
        if (errors.Count > 0) throw new ValidationAppException(errors);
        user.PasswordHash = hasher.Hash(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private static IEnumerable<string> ValidatePassword(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 6)
            yield return "Mật khẩu phải có ít nhất 6 ký tự.";
        else if (!password.Any(char.IsDigit) || !password.Any(char.IsLetter))
            yield return "Mật khẩu cần có cả chữ và số.";
    }

    private AuthResponse BuildResponse(User user)
    {
        var (token, expires) = jwt.Generate(user);
        return new AuthResponse(token, expires, ToDto(user));
    }

    public static UserDto ToDto(User u) =>
        new(u.Id, u.FullName, u.Email, u.Role.ToString(), u.TargetScore, u.CreatedAt);
}
