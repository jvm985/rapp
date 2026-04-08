# Server Dockerfile
FROM rocker/r-ver:4.4.2

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install system dependencies for common R packages
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libfontconfig1-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    libnlopt-dev \
    cmake \
    pandoc \
    && rm -rf /var/lib/apt/lists/*

# Install a wide range of useful R packages
RUN R -e "install.packages(c(\
    'jsonlite', 'tidyverse', 'tidymodels', 'shiny', \
    'rmarkdown', 'knitr', 'ggplot2', 'dplyr', 'readr', \
    'readxl', 'haven', 'lubridate', 'stringr', 'purrr', \
    'data.table', 'caret', 'randomForest', 'leaflet', \
    'plotly', 'DT', 'RColorBrewer', 'extrafont', \
    'reshape2', 'zoo', 'xts', 'forecast', 'lme4', 'mgcv', \
    'survival', 'MASS', 'stringi', 'magrittr', 'feather', \
    'DBI', 'RSQLite', 'RPostgreSQL', 'httr', 'xml2', \
    'rvest', 'devtools', 'roxygen2', 'testthat' \
    ), repos='https://cloud.r-project.org')"

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
