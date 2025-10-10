import express from 'express';
import validate from '../../middlewares/validate';
import testController from '../../controllers/test.controller';
import testValidation from '../../validations/test.validation';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Test
 *   description: Endpoints for development and testing purposes
 */

/**
 * @swagger
 * /test/generate-voucher:
 *   get:
 *     summary: Generate a test voucher image
 *     description: (DEV ONLY) - Creates a voucher image with a dynamic username and saves it to a temporary server folder.
 *     tags: [Test]
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: The username to embed in the voucher.
 *         example: "JohnDoe"
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 note:
 *                   type: string
 *                 filePath:
 *                   type: string
 *               example:
 *                 message: "Test voucher generated successfully."
 *                 note: "File saved locally on the server."
 *                 filePath: "C:\\...\\project\\temp_vouchers\\voucher_JohnDoe_167...9.png"
 *       "400":
 *         description: Bad Request (e.g., username is missing)
 */
router.get(
  '/generate-voucher',
  validate(testValidation.generateTestVoucher),
  testController.generateTestVoucher
);

export default router;
