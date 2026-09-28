using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ToeicPractice.Application.Features.Auth;

namespace ToeicPractice.Api.Controllers;

public class AuthController(IAuthService auth) : ApiControllerBase
{
    [HttpPost("register")]
    public Task<AuthResponse> Register(RegisterRequest request, CancellationToken ct) =>
        auth.RegisterAsync(request, ct);

    [HttpPost("login")]
    public Task<AuthResponse> Login(LoginRequest request, CancellationToken ct) =>
        auth.LoginAsync(request, ct);

    [Authorize, HttpGet("me")]
    public Task<UserDto> Me(CancellationToken ct) => auth.GetProfileAsync(CurrentUserId, ct);

    [Authorize, HttpPut("me")]
    public Task<UserDto> UpdateMe(UpdateProfileRequest request, CancellationToken ct) =>
        auth.UpdateProfileAsync(CurrentUserId, request, ct);

    [Authorize, HttpPost("me/password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(CurrentUserId, request, ct);
        return NoContent();
    }
}
