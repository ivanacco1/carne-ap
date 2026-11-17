@echo off
echo Iniciando AgroStock Ganadero (Java Spring Boot)...
set JAVA_HOME=C:\Program Files\Java\jdk-25
"%JAVA_HOME%\bin\java.exe" -jar "target\agrostock-backend-1.0.0.jar" --server.port=8000
pause
