import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseBackupController } from './database-backup.controller';

@Module({
  imports: [AuditModule],
  controllers: [DatabaseBackupController],
})
export class DatabaseBackupModule {}
