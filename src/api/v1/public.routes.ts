import { Router } from "express";
import {
  getPublicProperties,
  getPublicPropertyDetail,
  getPublicColleges,
} from "../../modules/properties/property.controller";

const router = Router();

router.get("/properties", getPublicProperties);

router.get("/properties/:slugOrCode", getPublicPropertyDetail);

router.get("/colleges", getPublicColleges);

export default router;
