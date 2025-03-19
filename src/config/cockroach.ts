import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const cockroachPool = new Pool({
    host: process.env.COCKROACH_HOST,
    user: process.env.COCKROACH_USER,
    password: process.env.COCKROACH_PASSWORD,
    database: process.env.COCKROACH_DATABASE,
    port: Number(process.env.COCKROACH_PORT),
    ssl: {
        rejectUnauthorized: false,
    },
});

export default cockroachPool;