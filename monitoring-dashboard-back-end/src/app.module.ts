import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CausesModule } from './causes/causes.module';
import { StopsModule } from './stops/stops.module';
import { MetrageModule } from './metrage/metrage.module';
import { VitesseModule } from './vitesse/vitesse.module';



@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<string>('DB_PORT') ?? 3306),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
        logging: false,

        // ✅ recommended for BIGINT ids + DATE columns
        supportBigNumbers: true,
        bigNumberStrings: true,

        // ✅ avoid timezone shift on DATE columns like `Jour`
        // keeps DATETIME as Date (vitesse/metrage) but returns DATE as string
        dateStrings: ['DATE'],
      }),

    }),

    CausesModule,
    StopsModule,
    MetrageModule,
    VitesseModule,
  ],
})

export class AppModule { }
