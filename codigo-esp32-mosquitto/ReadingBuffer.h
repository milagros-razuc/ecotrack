#ifndef ECOTRACK_READING_BUFFER_H
#define ECOTRACK_READING_BUFFER_H

#include <stddef.h>
#include <stdint.h>

struct ReadingBufferEntry {
  uint32_t ts;
  float temperatura;
  float humedad;
  int luminosidad;
};

template <size_t Capacity>
class ReadingBuffer {
 public:
  bool push(const ReadingBufferEntry& entry) {
    if (count_ == Capacity) {
      head_ = (head_ + 1) % Capacity;
      --count_;
    }

    entries_[tail_] = entry;
    tail_ = (tail_ + 1) % Capacity;
    ++count_;
    return true;
  }

  bool peek(ReadingBufferEntry& entry) const {
    if (count_ == 0) return false;
    entry = entries_[head_];
    return true;
  }

  bool discardFront() {
    if (count_ == 0) return false;
    head_ = (head_ + 1) % Capacity;
    --count_;
    return true;
  }

  size_t size() const { return count_; }
  bool empty() const { return count_ == 0; }
  bool full() const { return count_ == Capacity; }

 private:
  ReadingBufferEntry entries_[Capacity] = {};
  size_t head_ = 0;
  size_t tail_ = 0;
  size_t count_ = 0;
};

template <size_t Capacity, typename PublishCallback>
size_t flushReadingBuffer(ReadingBuffer<Capacity>& buffer,
                          size_t batchSize,
                          PublishCallback publish) {
  size_t published = 0;
  while (published < batchSize) {
    ReadingBufferEntry entry{};
    if (!buffer.peek(entry) || !publish(entry)) break;
    buffer.discardFront();
    ++published;
  }
  return published;
}

#endif
