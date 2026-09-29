import { CommandQueue } from "../camera-control/command-queue";

export class ViscaQueue extends CommandQueue {
  constructor() {
    super("visca");
  }
}
