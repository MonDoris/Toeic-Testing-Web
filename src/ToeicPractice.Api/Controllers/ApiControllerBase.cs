using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using ToeicPractice.Application.Common.Exceptions;

namespace ToeicPractice.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public abstract class ApiControllerBase : ControllerBase
{
    protected Guid? CurrentUserIdOrNull =>
        Guid.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;

    protected Guid CurrentUserId =>
        CurrentUserIdOrNull ?? throw new UnauthorizedAppException("Bạn cần đăng nhập.");
}
