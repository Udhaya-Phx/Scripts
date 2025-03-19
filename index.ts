import express from 'express';
import router from './src/router/basic.route';
import dotenv from 'dotenv';

const app = express();
dotenv.config();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', router);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}
);

