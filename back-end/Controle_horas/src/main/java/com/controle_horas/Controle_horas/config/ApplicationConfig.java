package com.controle_horas.Controle_horas.config;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({JwtProperties.class, CorsProperties.class})
public class ApplicationConfig {
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
