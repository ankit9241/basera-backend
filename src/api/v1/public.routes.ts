import { Router } from "express";
import {
  getPublicProperties,
  getPublicPropertyDetail,
  getPublicColleges,
} from "../../modules/properties/property.controller";
import { getPublicPropertyReviews } from "../../modules/reviews/review.controller";
import { submitContactMessage } from "../../modules/contact/contact.controller";
import { rateLimiter } from "../../middleware/rate-limiter";

const router = Router();

router.get("/properties", getPublicProperties);

router.get("/properties/:slugOrCode", getPublicPropertyDetail);
router.get("/properties/:slugOrCode/reviews", getPublicPropertyReviews);

router.get("/colleges", getPublicColleges);

// Public contact form endpoint with rate limiting
router.post(
  "/contact",
  rateLimiter(15 * 60 * 1000, 5, "Too many contact submissions. Please wait before trying again."),
  submitContactMessage
);

export default router;
