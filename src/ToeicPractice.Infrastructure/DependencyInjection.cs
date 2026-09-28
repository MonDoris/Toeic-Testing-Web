using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Infrastructure.Documents;
using ToeicPractice.Infrastructure.ExternalServices;
using ToeicPractice.Infrastructure.Identity;
using ToeicPractice.Infrastructure.Persistence;
using ToeicPractice.Infrastructure.Storage;

namespace ToeicPractice.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var provider = config["Database:Provider"] ?? "SqlServer";
        var connection = config.GetConnectionString("Default")
                         ?? throw new InvalidOperationException("Thiếu ConnectionStrings:Default.");

        services.AddDbContext<AppDbContext>(options =>
        {
            if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
                options.UseSqlite(connection);
            else
                options.UseSqlServer(connection, sql => sql.EnableRetryOnFailure(3));
        });
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddScoped<DataSeeder>();

        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
        services.Configure<StorageOptions>(config.GetSection(StorageOptions.Section));

        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        services.AddSingleton<IJwtTokenGenerator, JwtTokenGenerator>();
        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddSingleton<IOcrService, WindowsOcrService>();
        services.AddScoped<IPdfDocumentReader, PdfDocumentReader>();

        services.AddHttpClient<IDictionaryLookupService, FreeDictionaryClient>(c =>
        {
            c.BaseAddress = new Uri(config["Dictionary:BaseUrl"] ?? "https://api.dictionaryapi.dev/");
            c.Timeout = TimeSpan.FromSeconds(10);
            c.DefaultRequestHeaders.UserAgent.ParseAdd("ToeicPractice/1.0");
        });

        return services;
    }
}
