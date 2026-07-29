import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status}`, (exception as Error)?.stack);
    }

    res.status(status).json({
      statusCode: status,
      path: req.url,
      timestamp: new Date().toISOString(),
      ...(typeof payload === 'object' ? payload : { message: payload }),
    });
  }
}
