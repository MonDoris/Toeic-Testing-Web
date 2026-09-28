using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Diagnostics;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;

namespace ToeicPractice.Api.Infrastructure;

public class CurrentUserService(IHttpContextAccessor accessor) : ICurrentUserService
{
    public Guid? UserId =>
        Guid.TryParse(accessor.HttpContext?.User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;

    public bool IsAdmin => accessor.HttpContext?.User.IsInRole("Admin") ?? false;
}

/// <summary>Chuyển exception nghiệp vụ thành JSON lỗi thống nhất: { title, status, errors }.</summary>
public class AppExceptionHandler(ILogger<AppExceptionHandler> logger, IHostEnvironment env) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        int status;
        string title;
        IReadOnlyList<string> errors = [];

        switch (exception)
        {
            case ValidationAppException v:
                status = v.StatusCode; title = v.Message; errors = v.Errors; break;
            case AppException a:
                status = a.StatusCode; title = a.Message; break;
            case BadHttpRequestException b:
                status = b.StatusCode; title = b.StatusCode == 413 ? "File quá lớn." : "Yêu cầu không hợp lệ."; break;
            default:
                logger.LogError(exception, "Unhandled error on {Path}", context.Request.Path);
                status = 500;
                title = "Đã có lỗi xảy ra phía máy chủ.";
                if (env.IsDevelopment()) errors = [exception.Message];
                break;
        }

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { title, status, errors }, ct);
        return true;
    }
}
