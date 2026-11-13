-- Participation records no longer classify attendees as Learner or Mentor.
ALTER TABLE learning_participations
    DROP COLUMN participation_role;
