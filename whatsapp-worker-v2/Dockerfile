FROM whatsapp-base:v1

WORKDIR /app

# Copy package files
COPY package*.json ./

# Remove node_modules and package-lock.json if they exist to force clean install
# This is crucial because if you copy node_modules from host that has symlinks, they will be broken
RUN rm -rf node_modules package-lock.json

# Install dependencies (only Node.js deps now, system deps are in base)
RUN npm install

# Copy source code
COPY . .

# Remove any existing node_modules from the copy to ensure we use the freshly installed ones
# or rely on .dockerignore. But since we just installed, we want to keep installed ones.
# The issue is COPY . . overwrites node_modules if it exists in source.
# So we should exclude node_modules in .dockerignore or remove it from COPY context.
# But since we can't easily change context here without .dockerignore, let's create one.

# Create directory for sessions
RUN mkdir -p whatsapp-session

EXPOSE 4000

CMD ["node", "server.js"]
