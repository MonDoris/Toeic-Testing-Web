using Microsoft.Extensions.DependencyInjection;
using ToeicPractice.Application.Features.Admin;
using ToeicPractice.Application.Features.Attempts;
using ToeicPractice.Application.Features.Auth;
using ToeicPractice.Application.Features.Grammar;
using ToeicPractice.Application.Features.Tests;
using ToeicPractice.Application.Features.Tests.Import;
using ToeicPractice.Application.Features.Tests.Authoring;
using ToeicPractice.Application.Features.Vocabularies;

namespace ToeicPractice.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<ITestService, TestService>();
        services.AddScoped<ITestImportService, TestImportService>();
        services.AddScoped<ITestAuthoringService, TestAuthoringService>();
        services.AddScoped<IAttemptService, AttemptService>();
        services.AddScoped<IVocabularyService, VocabularyService>();
        services.AddScoped<IGrammarService, GrammarService>();
        services.AddScoped<IAdminService, AdminService>();
        return services;
    }
}
