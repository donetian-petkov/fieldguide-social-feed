CREATE DATABASE IF NOT EXISTS fieldguide_shadow;
GRANT ALL PRIVILEGES ON fieldguide_shadow.* TO 'fieldguide'@'%';
FLUSH PRIVILEGES;
