FROM node:20-alpine

# Prisma's engine needs OpenSSL, which isn't in the base Alpine image.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
# Full install (including devDependencies) so `docker compose exec api npm test`
# works too - this is a small assignment image, not a size-optimized prod build.
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 4000

# No migration files are committed yet (see README), so `db push` syncs the
# schema straight to the database on first boot instead of `migrate deploy`,
# which would need pre-generated migration SQL to have anything to apply.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node src/server.js"]
