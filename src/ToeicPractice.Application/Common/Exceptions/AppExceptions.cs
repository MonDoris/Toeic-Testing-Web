namespace ToeicPractice.Application.Common.Exceptions;

public abstract class AppException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public class NotFoundException(string entity, object key)
    : AppException($"Không tìm thấy {entity} ({key}).", 404);

public class ConflictException(string message) : AppException(message, 409);

public class UnauthorizedAppException(string message) : AppException(message, 401);

public class ForbiddenAppException(string message) : AppException(message, 403);

public class ValidationAppException : AppException
{
    public IReadOnlyList<string> Errors { get; }

    public ValidationAppException(IEnumerable<string> errors)
        : base("Dữ liệu không hợp lệ.", 400)
    {
        Errors = errors.ToList();
    }

    public ValidationAppException(string error) : this(new[] { error }) { }
}
