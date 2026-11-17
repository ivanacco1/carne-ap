@echo off
echo Compilando AgroStock Ganadero con Maven y Java 25...
set JAVA_HOME=C:\Program Files\Java\jdk-25
".tools\apache-maven-3.9.9\bin\mvn.cmd" clean package -DskipTests
echo.
echo Compilacion terminada. Puedes ejecutar run_java.bat
pause
