import { motion, useReducedMotion } from "motion/react";
import { easeOut, lineReveal } from "../../lib/motion";

const lines = [
  { text: "Normal things", mark: "Normal" },
  { text: "for everything", mark: null },
  { text: "you want to do.", mark: null },
];

export default function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="hero">
      <div className="hero-frame">
        <motion.a
          className="banner"
          href="/about#why"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut }}
        >
          No app · No wifi · No location
        </motion.a>

        <h1 className="display hero-title">
          {lines.map((line, index) => (
            <span className="hero-line" key={line.text}>
              <motion.span
                initial={false}
                animate="show"
                variants={lineReveal}
                transition={{ duration: 0.9, ease: easeOut, delay: reduce ? 0 : 0.08 + index * 0.09 }}
              >
                {line.mark ? (
                  <>
                    <span className="hero-word">{line.mark}</span>
                    {line.text.slice(line.mark.length)}
                  </>
                ) : (
                  line.text
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          className="hero-copy"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOut, delay: reduce ? 0 : 0.46 }}
        >
          No app, no wifi, no location sharing. Functional, quiet.
        </motion.p>

        <motion.div
          className="btn-row"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: easeOut, delay: reduce ? 0 : 0.58 }}
        >
          <a className="btn btn-primary" href="#notify">
            Notify me
          </a>
          <a className="btn btn-ghost" href="#things">
            See the things
          </a>
        </motion.div>
      </div>
    </section>
  );
}
