package com.agrostock.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;

import javax.sql.DataSource;

@Configuration
public class DatabaseConfig {

    @Bean
    public DataSource dataSource() {
        HikariDataSource ds = new HikariDataSource();
        ds.setDriverClassName("org.sqlite.JDBC");
        ds.setJdbcUrl("jdbc:sqlite:ganaderia.db");
        ds.setMaximumPoolSize(5);
        return ds;
    }

    @Bean
    public JdbcClient jdbcClient(DataSource dataSource) {
        JdbcClient client = JdbcClient.create(dataSource);
        try {
            client.sql("PRAGMA foreign_keys = ON;").query().listOfRows();
            client.sql("PRAGMA journal_mode = WAL;").query().listOfRows();
        } catch (Exception e) {
            System.err.println("Aviso al configurar PRAGMA de SQLite: " + e.getMessage());
        }
        return client;
    }
}
