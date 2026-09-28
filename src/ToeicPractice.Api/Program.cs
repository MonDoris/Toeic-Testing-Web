using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ToeicPractice.Api.Infrastructure;
using ToeicPractice.Application;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Infrastructure;
using ToeicPractice.Infrastructure.Identity;
using ToeicPractice.Infrastructure.Persistence;
using ToeicPractice.Infrastructure.Storage;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Đường dẫn upload tương đối được tính từ thư mục project Api.
var storageRoot = config[$"{StorageOptions.Section}:RootPath"] ?? "App_Data/uploads";
if (!Path.IsPathRooted(storageRoot))
    config[$"{StorageOptions.Section}:RootPath"] = Path.Combine(builder.Environment.ContentRootPath, storageRoot);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(config);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddExceptionHandler<AppExceptionHandler>();
builder.Services.AddProblemDetails();

// Gói đề thi (audio đầy đủ 45 phút + ảnh) có thể khá lớn.
const long maxUpload = 500L * 1024 * 1024; // audio đầy đủ cả đề Listening
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = maxUpload);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = maxUpload);

var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.Secret) || jwt.Secret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret phải dài tối thiểu 32 ký tự.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            RoleClaimType = System.Security.Claims.ClaimTypes.Role,
            NameClaimType = System.Security.Claims.ClaimTypes.Name
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(o => o.AddPolicy("client", p => p
    .WithOrigins(config.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "TOEIC Practice API", Version = "v1" });
    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
    };
    c.AddSecurityDefinition("Bearer", scheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { [scheme] = [] });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<DataSeeder>().SeedAsync();
}

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// File media upload (audio/ảnh đề thi)
var storage = config.GetSection(StorageOptions.Section).Get<StorageOptions>() ?? new StorageOptions();
Directory.CreateDirectory(storage.RootPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(storage.RootPath),
    RequestPath = storage.RequestPath,
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        ctx.Context.Response.Headers.CacheControl = "public,max-age=604800";
    }
});

// Front-end React đã build (npm run build → wwwroot)
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors("client");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
// API không tồn tại → 404 JSON thay vì trả về trang SPA
app.Map("/api/{**rest}", () => Results.NotFound(new { title = "Không tìm thấy API.", status = 404 }));
app.MapFallbackToFile("index.html");

app.Run();
