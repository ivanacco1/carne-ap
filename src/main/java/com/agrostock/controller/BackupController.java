package com.agrostock.controller;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/backup")
public class BackupController {

    @GetMapping
    public ResponseEntity<Resource> downloadDatabaseBackup() {
        File dbFile = new File("ganaderia.db");
        if (!dbFile.exists() || !dbFile.canRead()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Archivo de base de datos no encontrado");
        }

        Resource resource = new FileSystemResource(dbFile);
        String filename = "respaldo_ganaderia_" + LocalDate.now() + ".db";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(dbFile.length())
                .body(resource);
    }
}
