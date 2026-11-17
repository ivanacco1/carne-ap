package com.agrostock.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Mapear la carpeta static existente en la raíz del proyecto
        registry.addResourceHandler("/static/**")
                .addResourceLocations("file:./static/");
        
        registry.addResourceHandler("/**")
                .addResourceLocations("file:./static/");
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // Redirigir la raíz a index.html
        registry.addViewController("/").setViewName("forward:/static/index.html");
    }
}
